import * as THREE from 'three';
import LayerUpdateState from '../Core/Layer/LayerUpdateState';
import ObjectRemovalHelper from './ObjectRemovalHelper';
import CancelledCommandException from '../Core/Scheduler/CancelledCommandException';

function create3DObject(context, layer, node) {
    if (!node.parent && node.children.length) {
                // if node has been removed dispose three.js resource
        ObjectRemovalHelper.removeChildrenAndCleanupRecursively(layer.id, node);
        return;
    }

    if (!node.visible) {
        return;
    }

    const features = node.children.filter(n => n.layer == layer.id);
    if (features.length > 0) {
        return features;
    }

    if (!layer.tileInsideLimit(node, layer)) {
        return;
    }

    if (node.layerUpdateState[layer.id] === undefined) {
        node.layerUpdateState[layer.id] = new LayerUpdateState();
    }

    const ts = Date.now();

    if (!node.layerUpdateState[layer.id].canTryUpdate(ts)) {
        return;
    }

    node.layerUpdateState[layer.id].newTry();

    const command = {
        layer,
        view: context.view,
        threejsLayer: layer.threejsLayer,
        requester: node,
    };

    context.scheduler.execute(command).then((result) => {
        if (result) {
            node.layerUpdateState[layer.id].success();
            if (!node.parent) {
                ObjectRemovalHelper.removeChildrenAndCleanupRecursively(layer.id, result);
                return;
            }
                    // result coordinayes are in Worl system
                    // update position to be relative to the tile
            result.position.sub(node.extent.center().as(context.view.referenceCrs).xyz());
            result.layer = layer.id;
            node.add(result);
            node.updateMatrixWorld();
        } else {
            node.layerUpdateState[layer.id].failure(1, true);
        }
    },
            (err) => {
                if (err instanceof CancelledCommandException) {
                    node.layerUpdateState[layer.id].success();
                } else if (err instanceof SyntaxError) {
                    node.layerUpdateState[layer.id].failure(0, true);
                } else {
                    node.layerUpdateState[layer.id].failure(Date.now());
                    setTimeout(node.layerUpdateState[layer.id].secondsUntilNextTry() * 1000,
                    () => {
                        context.view.notifyChange(false);
                    });
                }
            });
}

function updateMatrixMaterial(oiInfo, layer, camera) {
    if (!layer.mLocalToPano) return;
    // a recalculer a chaque fois que la camera bouge
    var mCameraToWorld = camera.matrixWorld;
    var mCameraToPano = layer.mLocalToPano.clone().multiply(layer.mWorldToLocal).clone().multiply(mCameraToWorld);

    for (var i = 0; i < layer.shaderMat.uniforms.mvpp.value.length; ++i) {
        var mp2t = layer.sensors[i].mp2t.clone();
        layer.shaderMat.uniforms.mvpp.value[i] = mp2t.multiply(mCameraToPano);
    }
}

function updateMaterial(context, camera, scene, layer) {
    var currentPos = camera.position.clone();
    var position = new THREE.Vector3(currentPos.x, currentPos.y, currentPos.z);
    const verbose = false;
    // if necessary create the sphere
    if (!layer.sphere && layer.sphereRadius) {
        // On cree une sphere et on l'ajoute a la scene
        var geometry = new THREE.SphereGeometry(layer.sphereRadius, 32, 32);
        // var material = layer.shaderMat;
        var material = new THREE.MeshPhongMaterial({ color: 0x7777ff, side: THREE.DoubleSide, transparent: true, opacity: 0.5, wireframe: true });
        layer.sphere = new THREE.Mesh(geometry, material);
        layer.sphere.visible = true;
        layer.sphere.layer = layer;// layer.idsphere;
        layer.sphere.name = 'immersiveSphere';
        scene.add(layer.sphere);

        // sphere can be create before shaderMat
        // update the material to be sure
        if (layer.shaderMat) layer.sphere.material = layer.shaderMat;
    }

    // look for the closest oriented image
    if (layer.orientedImages)
    {
        var minDist = -1;
        var minIndice = -1;
        let indice = 0;
        if (verbose) {
            // eslint-disable-next-line no-console
            console.log('OrientedImageProcessing update : loop in ', layer.orientedImages.length, ' pano..');
        }
        for (const ori of layer.orientedImages) {
            var vPano = new THREE.Vector3(ori.coordinates._values[0], ori.coordinates._values[1], ori.coordinates._values[2]);
            var D = position.distanceTo(vPano);
            if ((minDist < 0) || (minDist > D)) {
                minDist = D;
                minIndice = indice;
            }
            ++indice;
        }
        if (verbose) {
            // eslint-disable-next-line no-console
            console.log('OrientedImageProcessing update : loop done !');
        }

        const oiInfo = layer.orientedImages[minIndice];

        // detection of oriented image change
        if (layer.currentPano !== minIndice) {
            layer.currentPano = minIndice;
            var P = layer.orientedImages[minIndice].coordinates;
            if (layer.sphere) {
                layer.sphere.position.set(P._values[0], P._values[1], P._values[2]);
                layer.sphere.updateMatrixWorld();
            }

            const command = {
                layer,
                view: context.view,
                threejsLayer: layer.threejsLayer,
                requester: minIndice,
            };

            context.scheduler.execute(command).then(result => updateMaterialWithTexture(result, oiInfo, layer, camera));
            // loadOrientedImageData(layer.orientedImages[minIndice], layer, camera);
        }
        else {
            // update the uniforms
            updateMatrixMaterial(oiInfo, layer, camera);
        }
    }
}

function getTransfoGeoCentriqueToLocal(cGeocentrique) {
    var position = new THREE.Vector3().set(cGeocentrique._values[0], cGeocentrique._values[1], cGeocentrique._values[2]);
    var object = new THREE.Object3D();
    object.up = THREE.Object3D.DefaultUp;
    object.position.copy(position);
    object.lookAt(position.clone().multiplyScalar(1.1));
    object.updateMatrixWorld();
    return new THREE.Matrix4().makeRotationFromQuaternion(object.quaternion.clone().inverse()).multiply(new THREE.Matrix4().makeTranslation(-position.x, -position.y, -position.z));
}

function getTransfoLocalToPanoStereopolis2(roll, pitch, heading) {
    const euler = new THREE.Euler(
        pitch * Math.PI / 180,
        roll * Math.PI / 180,
        heading * Math.PI / 180, 'ZXY');
    const qLocalToPano = new THREE.Quaternion().setFromEuler(euler);
    return new THREE.Matrix4().makeRotationFromQuaternion(qLocalToPano);
}

function getTransfoLocalToPanoMicMac(roll, pitch, heading) {
    // Omega
    var o = parseFloat(roll) / 180 * Math.PI;  // Deg to Rad // Axe X
    // Phi
    var p = parseFloat(pitch) / 180 * Math.PI;  // Deg to Rad // axe Y
    // Kappa
    var k = parseFloat(heading) / 180 * Math.PI;  // Deg to Rad // axe Z
    var M4 = new THREE.Matrix4();
    M4.elements[0] = Math.cos(p) * Math.cos(k);
    M4.elements[1] = Math.cos(p) * Math.sin(k);
    M4.elements[2] = -Math.sin(p);

    M4.elements[4] = Math.cos(o) * Math.sin(k) + Math.sin(o) * Math.sin(p) * Math.cos(k);
    M4.elements[5] = -Math.cos(o) * Math.cos(k) + Math.sin(o) * Math.sin(p) * Math.sin(k);
    M4.elements[6] = Math.sin(o) * Math.cos(p);

    M4.elements[8] = Math.sin(o) * Math.sin(k) - Math.cos(o) * Math.sin(p) * Math.cos(k);
    M4.elements[9] = -Math.sin(o) * Math.cos(k) - Math.cos(o) * Math.sin(p) * Math.sin(k);
    M4.elements[10] = -Math.cos(o) * Math.cos(p);
    return M4;
}

function updateMaterialWithTexture(textures, oiInfo, layer, camera) {
    if (!textures) return;
    for (let i = 0; i < textures.length; ++i) {
        var oldTexture = layer.shaderMat.uniforms.texture.value[i];
        layer.shaderMat.uniforms.texture.value[i] = textures[i];
        if (oldTexture) oldTexture.dispose();
    }
    layer.mWorldToLocal = getTransfoGeoCentriqueToLocal(oiInfo.coordinates);
    if (layer.orientationType && (layer.orientationType == 'Stereopolis2')) {
        layer.mLocalToPano = getTransfoLocalToPanoStereopolis2(oiInfo.roll, oiInfo.pitch, oiInfo.heading);
    }
    else {
        layer.mLocalToPano = getTransfoLocalToPanoMicMac(oiInfo.roll, oiInfo.pitch, oiInfo.heading);
    }

    updateMatrixMaterial(oiInfo, layer, camera);
}

export default {
    update() {
        return function _(context, layer, node) {
            if (layer.points) create3DObject(context, layer, node);
            updateMaterial(context, context.camera.camera3D, context.view.scene, layer);
        };
    },
};
