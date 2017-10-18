/**
 * Generated On: 2017-12-09
 * Class: OrientedImage_Provider
 * Description: Provides Oriented Image data for immersive navigation
 */
import * as THREE from 'three';
import format from 'string-format';
import Extent from '../../Geographic/Extent';
import Coordinates from '../../Geographic/Coordinates';
import Provider from './Provider';
import Fetcher from './Fetcher';
import CacheRessource from './CacheRessource';
import TileMesh from '../../TileMesh';
import textureVS from '../../../Renderer/Shader/ProjectiveTextureVS.glsl';
import textureFS from '../../../Renderer/Shader/ProjectiveTextureFS.glsl';

function OrientedImage_Provider() {
    this.cache = CacheRessource();
}

OrientedImage_Provider.prototype = Object.create(Provider.prototype);

OrientedImage_Provider.prototype.constructor = OrientedImage_Provider;

OrientedImage_Provider.prototype.preprocessDataLayer = function preprocessDataLayer(layer) {
    layer.format = layer.options.mimetype || 'json';
    layer.offset = layer.offset || { x: 0, y: 0, z: 0 };
    layer.orientedImages = null;
    layer.currentPano = -1;
    layer.currentMat = null;
    layer.sensors = [];
    layer.networkOptions = { crossOrigin: '' };
    if (!(layer.extent instanceof Extent)) {
        layer.extent = new Extent(layer.projection, layer.extent);
    }
    var promises = [];

    // layer.orientations: a JSON file with position/orientation for all the oriented images
    promises.push(Fetcher.json(layer.orientations, layer.networkOptions));
    // layer.calibrations: a JSON file with calibration for all cameras
    // it's possible to have more than one camera (ex: ladybug images with 6 cameras)
    promises.push(Fetcher.json(layer.calibrations, layer.networkOptions));

    return Promise.all(promises).then((res) => { orientedImagesInit(res[0], layer); sensorsInit(res[1], layer); });
};

// initialize a 3D position for each image (including offset or CRS projection if necessary)
function orientedImagesInit(res, layer) {
    layer.orientedImages = res;
    for (const ori of layer.orientedImages) {
        ori.easting += layer.offset.x;
        ori.northing += layer.offset.y;
        ori.altitude += layer.offset.z;
        if (layer.projection == 'EPSG:4978') {
            ori.coordinates = new Coordinates('EPSG:4978', ori.easting, ori.northing, ori.altitude);
        }
        else if (layer.projection == 'EPSG:4326') {
            ori.coordinates = new Coordinates('EPSG:4326', ori.easting, ori.northing, ori.altitude).as('EPSG:4978');
        }
        else {
            ori.coordinates = new Coordinates(layer.projection, ori.easting, ori.northing, ori.altitude).as('EPSG:4326').as('EPSG:4978');
        }
    }
}

// initialize a sensor for each camera and create the material (and the shader)
function sensorsInit(res, layer) {
    let i;

    var withDistort = false;
    for (const s of res) {
        var sensor = {};
        sensor.id = s.id;

        var rotCamera2Pano = new THREE.Matrix3().fromArray(s.rotation);
        var rotTerrain = new THREE.Matrix3().set(
            1, 0, 0,
            0, 1, 0,
            0, 0, 1);
        if (layer.orientationType && (layer.orientationType == 'Stereopolis2')) {
            rotTerrain = new THREE.Matrix3().set(
                0, -1, 0,
                1, 0, 0,
                0, 0, 1);
        }
        var rotEspaceImage = new THREE.Matrix3().set(
            1, 0, 0,
            0, 1, 0,
            0, 0, 1);
        rotCamera2Pano = rotTerrain.clone().multiply(rotCamera2Pano.clone().multiply(rotEspaceImage));
        var rotPano2Camera = rotCamera2Pano.clone().transpose();

        var centerCameraInPano = new THREE.Vector3().fromArray(s.position);
        var transPano2Camera = new THREE.Matrix4().makeTranslation(
            -centerCameraInPano.x,
            -centerCameraInPano.y,
            -centerCameraInPano.z);
        var projection = (new THREE.Matrix3().fromArray(s.projection)).transpose();
        var rotPano2Texture = projection.clone().multiply(rotPano2Camera);
        sensor.mp2t = getMatrix4FromRotation(rotPano2Texture).multiply(transPano2Camera);
        // sensor.rotPano2Texture = rotPano2Texture;
        // sensor.centerCameraInPano = centerCameraInPano;
        sensor.distortion = null;
        sensor.pps = null;
        if (s.distortion) {
            sensor.pps = new THREE.Vector2().fromArray(s.distortion.pps);
            var disto = new THREE.Vector3().fromArray(s.distortion.poly357);
            sensor.distortion = new THREE.Vector4(disto.x, disto.y, disto.z, s.distortion.limit * s.distortion.limit);
            if (s.distortion.l1l2) {
                sensor.l1l2 = new THREE.Vector2().fromArray(s.distortion.l1l2);
                sensor.etats = s.distortion.etats;
            }
            else {
                sensor.l1l2 = new THREE.Vector2().set(0, 0);
                sensor.etats = 0;
            }
            withDistort = true;
        }
        sensor.size = new THREE.Vector2().fromArray(s.size);
        layer.sensors.push(sensor);
    }
    shadersInit();

    function shadersInit() {
        var U = {
            size: { type: 'v2v', value: [] },
            mvpp: { type: 'm4v', value: [] },
            texture: { type: 'tv', value: [] },
        };
        if (withDistort) {
            U.distortion = { type: 'v4v', value: [] };
            U.pps = { type: 'v2v', value: [] };
            U.l1l2 = { type: 'v3v', value: [] };
        }
        for (i = 0; i < layer.sensors.length; ++i) {
            U.size.value[i] = layer.sensors[i].size;
            U.mvpp.value[i] = new THREE.Matrix4();
            U.texture.value[i] = new THREE.Texture();
            if (withDistort) {
                U.distortion.value[i] = layer.sensors[i].distortion;
                U.pps.value[i] = layer.sensors[i].pps;
                U.l1l2.value[i] = new THREE.Vector3().set(layer.sensors[i].l1l2.x, layer.sensors[i].l1l2.y, layer.sensors[i].etats);
            }
        }
        let projectiveTextureFS = `#define N ${layer.sensors.length}\n`;
        projectiveTextureFS += withDistort ? '#define WITH_DISTORT\n' : '';
        projectiveTextureFS += textureFS;
        for (i = 0; i < layer.sensors.length; ++i) {
            projectiveTextureFS += `if(texcoord[${i}].z>0.) {\n\
            p =  texcoord[${i}].xy/texcoord[${i}].z;\n\
            #ifdef WITH_DISTORT\n\
              distort(p,distortion[${i}],l1l2[${i}],pps[${i}]);\n\
            #endif\n\
               d = borderfadeoutinv * getUV(p,size[${i}]);\n\
               if(d>0.) {\n\
                   c = d*texture2D(texture[${i}],p);\n\
                   color += c;\n\
                   if(c.a>0.) ++blend;\n\
               }\n\
            }\n`;
        }
        projectiveTextureFS += '   if (color.a > 0.0) color = color / color.a;\n' +
            '   color.a = 1.;\n' +
            '   gl_FragColor = color;\n' +
            '} \n';
        // create the shader material for Three
        layer.shaderMat = new THREE.ShaderMaterial({
            uniforms: U,
            vertexShader: `#define N ${layer.sensors.length}\n ${textureVS}`,
            fragmentShader: projectiveTextureFS,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.1,
        });
    }

    function getMatrix4FromRotation(Rot) {
        var M4 = new THREE.Matrix4();
        M4.elements[0] = Rot.elements[0];
        M4.elements[1] = Rot.elements[1];
        M4.elements[2] = Rot.elements[2];
        M4.elements[4] = Rot.elements[3];
        M4.elements[5] = Rot.elements[4];
        M4.elements[6] = Rot.elements[5];
        M4.elements[8] = Rot.elements[6];
        M4.elements[9] = Rot.elements[7];
        M4.elements[10] = Rot.elements[8];
        return M4;
    }
}

OrientedImage_Provider.prototype.tileInsideLimit = function tileInsideLimit(tile, layer) {
    return (layer.level === undefined || tile.level === layer.level) && layer.extent.intersect(tile.extent);
};

// request textures for an oriented image
function loadOrientedImageData(layer, command) {
    const minIndice = command.requester;
    if (minIndice != layer.currentPano) {
        // console.log('OrientedImage Provider cancel texture loading');
        return Promise.resolve();
    }
    const oiInfo = layer.orientedImages[minIndice];
    var promises = [];
    for (const sensor of layer.sensors) {
        var url = format(layer.images, { imageId: oiInfo.id, sensorId: sensor.id });
        const { texture, promise } = Fetcher.texture(url, layer.networkOptions);
        promise.then(() => texture);
        promises.push(promise);
    }
    return Promise.all(promises);
}

OrientedImage_Provider.prototype.executeCommand = function executeCommand(command) {
    const layer = command.layer;
    const tile = command.requester;
    const destinationCrs = command.view.referenceCrs;
    // position of pano
    if (command.requester instanceof TileMesh) {
        return this.getFeatures(destinationCrs, tile, layer, command).then(result => command.resolve(result));
    } else {
        // texture of pano
        return loadOrientedImageData(layer, command).then(result => command.resolve(result));
    }
};

function assignLayer(object, layer) {
    if (object) {
        object.layer = layer.id;
        object.layers.set(layer.threejsLayer);
        for (const c of object.children) {
            assignLayer(c, layer);
        }
        return object;
    }
}

function applyColor(colorAttribute, indice) {
    const pos = indice / 3;
    const pos4 = pos % 4;
    switch (pos4) {
        case 0:
            colorAttribute[indice] = 0;
            colorAttribute[indice + 1] = 255;
            colorAttribute[indice + 2] = 0;
            break;
        case 1:
            colorAttribute[indice] = 255;
            colorAttribute[indice + 1] = 255;
            colorAttribute[indice + 2] = 0;
            break;
        case 2:
            colorAttribute[indice] = 255;
            colorAttribute[indice + 1] = 0;
            colorAttribute[indice + 2] = 0;
            break;
        case 3:
            colorAttribute[indice] = 0;
            colorAttribute[indice + 1] = 0;
            colorAttribute[indice + 2] = 0;
            break;
        default:
            break;
    }
}

// load data for a layer/tile/crs
OrientedImage_Provider.prototype.getFeatures = function getFeatures(crs, tile, layer) {
    if ((layer.orientedImages) && (layer.orientedImages.length > 0))
    {
        var sel = [];
        var prop = [];
        var indicePano = [];
        let i = 0;
        for (const ori of layer.orientedImages) {
            var coordinates = ori.coordinates;
            if (tile.extent.isPointInside(coordinates)) {
                sel.push([coordinates._values[0], coordinates._values[1], coordinates._values[2]]);
                prop.push(ori);
                indicePano.push(i);
            }
            ++i;
        }
        if (sel.length) {
            // create THREE.Points with the orientedImage position
            const vertices = new Float32Array(3 * sel.length);
            const colorAttribute = new Uint8Array(sel.length * 3);
            let indice = 0;
            for (const v of sel) {
                vertices[indice] = v[0] - sel[0][0];
                vertices[indice + 1] = v[1] - sel[0][1];
                vertices[indice + 2] = v[2] - sel[0][2];

                applyColor(colorAttribute, indice);
                indice += 3;
            }
            const bufferGeometry = new THREE.BufferGeometry();
            bufferGeometry.addAttribute('position', new THREE.BufferAttribute(vertices, 3));
            bufferGeometry.addAttribute('color', new THREE.BufferAttribute(colorAttribute, 3, true));
            const P = new THREE.Points(bufferGeometry);

            P.material.vertexColors = THREE.VertexColors;
            P.material.color = new THREE.Color(0xffffff);
            P.material.size = 5;
            P.material.sizeAttenuation = false;
            P.opacity = 0.5;
            P.transparent = true;

            P.position.set(sel[0][0], sel[0][1], sel[0][2]);
            P.updateMatrixWorld(true);
            return Promise.resolve(assignLayer(P, layer));
        }
    }
    return Promise.resolve();
};

export default OrientedImage_Provider;
