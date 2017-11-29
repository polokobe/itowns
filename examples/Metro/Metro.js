/* global itowns, document, renderer */
// # Simple Globe viewer

var debugGui = new dat.GUI({ width: 200 });

// Define initial camera position
var positionOnGlobe = { longitude: 2.4350, latitude: 48.8578, altitude: 100 };
var promises = [];

// `viewerDiv` will contain iTowns' rendering area (`<canvas>`)
var viewerDiv = document.getElementById('viewerDiv');

// Instanciate iTowns GlobeView*
var globeView = new itowns.GlobeView(viewerDiv, positionOnGlobe, {
    // immersiveControls:true,
    controlsSwitcher: true, 
    renderer: renderer, 
    handleCollision: false,
    sseSubdivisionThreshold: 10,
});
function addLayerCb(layer) {
    return globeView.addLayer(layer);
}
globeView.controls.minDistance = 0;
// Define projection that we will use (taken from https://epsg.io/3946, Proj4js section)
itowns.proj4.defs('EPSG:3946',
    '+proj=lcc +lat_1=45.25 +lat_2=46.75 +lat_0=46 +lon_0=3 +x_0=1700000 +y_0=5200000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');

// Add one imagery layer to the scene
// This layer is defined in a json file but it could be defined as a plain js
// object. See Layer* for more info.
promises.push(itowns.Fetcher.json('../layers/JSONLayers/Ortho.json').then(addLayerCb));

// Add two elevation layers.
// These will deform iTowns globe geometry to represent terrain elevation.
// promises.push(itowns.Fetcher.json('../layers/JSONLayers/WORLD_DTM.json').then(addLayerCb));
promises.push(itowns.Fetcher.json('../layers/JSONLayers/IGN_MNT_HIGHRES.json').then(addLayerCb));

function altitudeBuildings(properties) {
    return properties.z_min - properties.hauteur;
}

function extrudeBuildings(properties) {
    return properties.hauteur;
}

var textureLayer;
globeView.addLayer({
    type: 'geometry',
    update: itowns.OrientedImageProcessing.update(),
    images: 'http://localhost:8080/examples/Metro/images/{imageId}_{sensorId}.jpg',
    orientations: 'http://localhost:8080/examples/Metro/images/Metro_024_pano.json',
    calibrations: 'http://localhost:8080/examples/Metro/images/Metro_024_camera.json',
    protocol: 'orientedimage',
    // sphereRadius: 500,
    offset: {x: 650000, y: 6860000, z: 0},
    // version: '2.0.0',
    id: 'demo_orientedImage',
    level: 16,
    projection: 'EPSG:2154',
    view: globeView,
    crsOut: globeView.referenceCrs,
    options: {
        mimetype: 'geojson',
    },
}, globeView.tileLayer).then(result => {

    if (globeView.controls instanceof itowns.ImmersiveControls || 
        globeView.controls instanceof itowns.ControlsSwitcher )
        globeView.controls.addLayer(result);

    // LOAD POINT CLOUD
    pointcloud = new itowns.GeometryLayer('Point cloud', new itowns.THREE.Group());
    pointcloud.type = 'geometry';
    pointcloud.file =  'cloud.js';
    pointcloud.protocol = 'potreeconverter';
    pointcloud.url = 'http://localhost:8080/examples/Metro/Lidar';
    // set size to 1
    pointcloud.pointSize = 1;

    function onLayerReady() {
        debug.PointCloudDebug.initTools(globeView, pointcloud, debugGui);
        
        // add GUI entry
        menuGlobe.addImageryLayerGUI(pointcloud);
    }
    
    itowns.View.prototype.addLayer.call(globeView, pointcloud).then(onLayerReady);

    // LOAD POINT CLOUD
    pointcloud2 = new itowns.GeometryLayer('Centre Photo', new itowns.THREE.Group());
    pointcloud2.type = 'geometry';
    pointcloud2.file =  'cloud.js';
    pointcloud2.protocol = 'potreeconverter';
    pointcloud2.url = 'http://localhost:8080/examples/Metro/AperiCloud';
    // set size to 1
    pointcloud2.pointSize = 1;

    function onLayerReady2() {
        pointcloud2.visible = false;
        pointcloud2.bboxes.visible  = false;
        
        // add GUI entry
        menuGlobe.addImageryLayerGUI(pointcloud2);
    }
    
    itowns.View.prototype.addLayer.call(globeView, pointcloud2).then(onLayerReady2);


    
    // LOAD PLY SURFACE
    var loader = new itowns.THREE.PLYLoader();
    loader.load('http://localhost:8080/examples/Metro/poisson_4978_bin.ply', function (geometry) {
        // create mesh
        var mesh = new itowns.THREE.Mesh( geometry, result.shaderMat );
        mesh.position.copy(new itowns.THREE.Vector3().set(4200000,178000,4780000));
        mesh.updateMatrixWorld();
        // create layer
        var meshLayer = new itowns.GeometryLayer('Surface', mesh);
        meshLayer.update = function() {};
        meshLayer.name = 'Mesh Layer';
        meshLayer.overrideMaterials = true;  // custom cesium shaders are not functional
        meshLayer.type = 'geometry';
        meshLayer.visible = true;
        globeView.addLayer(meshLayer);
        mesh.layer = meshLayer.id;
        // add GUI entry
        menuGlobe.addImageryLayerGUI(meshLayer);
    });

    var folder = menuGlobe.gui.addFolder('ControlsSwitcher');
        folder.add({ immersive: true }, 'immersive').onChange(function switchMode(value) {
            globeView.controls.switchMode();
        });
});

exports.view = globeView;
exports.initialPosition = positionOnGlobe;
