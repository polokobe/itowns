/* global itowns, document, renderer */
// # Simple Globe viewer

// Define initial camera position
var positionOnGlobe = { longitude: 2.33481381638492, latitude: 48.850602961052147, altitude: 50};
// var positionOnGlobe = { longitude: 2.391864678818233, latitude: 48.889957901766138, altitude: 80 };
// var positionOnGlobe = { longitude: 4.818, latitude: 45.7354, altitude: 3000 };
var promises = [];

// `viewerDiv` will contain iTowns' rendering area (`<canvas>`)
var viewerDiv = document.getElementById('viewerDiv');

// Instanciate iTowns GlobeView*
var globeView = new itowns.GlobeView(viewerDiv, positionOnGlobe, { 
    immersiveControls: true, 
    renderer: renderer, 
    handleCollision: false,
    sseSubdivisionThreshold: 10,
});

//globeView.controls.minDistance = 0;

// speed up controls
globeView.controls.moveSpeed = 10;

function addLayerCb(layer) {
    return globeView.addLayer(layer);
}

// Define projection that we will use (taken from https://epsg.io/3946, Proj4js section)
itowns.proj4.defs('EPSG:3946',
    '+proj=lcc +lat_1=45.25 +lat_2=46.75 +lat_0=46 +lon_0=3 +x_0=1700000 +y_0=5200000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');

// Add one imagery layer to the scene
// This layer is defined in a json file but it could be defined as a plain js
// object. See Layer* for more info.
promises.push(itowns.Fetcher.json('./layers/JSONLayers/Ortho.json').then(addLayerCb));

// Add two elevation layers.
// These will deform iTowns globe geometry to represent terrain elevation.
promises.push(itowns.Fetcher.json('./layers/JSONLayers/WORLD_DTM.json').then(addLayerCb));
promises.push(itowns.Fetcher.json('./layers/JSONLayers/IGN_MNT_HIGHRES.json').then(addLayerCb));

function colorBuildings(properties) {
    if (properties.id.indexOf('bati_remarquable') === 0) {
        return new itowns.THREE.Color(0x5555ff);
    } else if (properties.id.indexOf('bati_industriel') === 0) {
        return new itowns.THREE.Color(0xff5555);
    }
    return new itowns.THREE.Color(0xeeeeee);
}

function altitudeBuildings(properties) {
    return properties.z_min - properties.hauteur - 3;
}

function extrudeBuildings(properties) {
    return properties.hauteur + 10;
}

var textureLayer;
globeView.addLayer({
    type: 'geometry',
    update: itowns.OrientedImageProcessing.update(),
    images: 'http://www.itowns-project.org/itowns-sample-data/images/140616/Paris-140616_0740-{sensorId}-00001_0000{imageId}.jpg',
    // orientations: 'http://localhost:8080/examples/panoramicsMetaData-4326-one.geojson',
    // orientations: 'http://localhost:8080/examples/panoramicsMetaData-4326.geojson',
    orientations: 'http://www.itowns-project.org/itowns-sample-data/panoramicsMetaData.json',
    calibrations: 'http://localhost:8080/examples/cameraCalibration.json',
    // images: 'http://localhost:8080/LaVillette/images_512/{imageId}_{sensorId}.jpg',
    // orientations: 'http://localhost:8080/LaVillette/demo-4326.geojson',
    // calibrations: 'http://localhost:8080/LaVillette/cameraMetaData.json',
    protocol: 'orientedimage',
    offset: {x: 0, y: 0, z: 2},
    sphereRadius: 500,
    // version: '2.0.0',
    id: 'demo_orientedImage',
    // typeName: 'tcl_sytral.tcllignebus',
    level: 16,
    projection: 'EPSG:2154',
    orientationType: 'Stereopolis2',
    view: globeView,
    crsOut: globeView.referenceCrs,
    options: {
        mimetype: 'geojson',
    },
}, globeView.tileLayer).then(result => {
    globeView.controls.addLayer(result);
    globeView.addLayer({
        type: 'geometry',
        update: itowns.FeatureProcessing.update,
        convert: itowns.Feature2Mesh.convert({
        color: colorBuildings,
        altitude: altitudeBuildings,
        extrude: extrudeBuildings }),
        onMeshCreated: function setMaterial(res) { res.children[0].material = result.shaderMat; },
        url: 'http://wxs.ign.fr/72hpsel8j8nhb5qgdh07gcyp/geoportail/wfs?',
        protocol: 'wfs',
        version: '2.0.0',
        id: 'wfsBuilding',
        typeName: 'BDTOPO_BDD_WLD_WGS84G:bati_remarquable,BDTOPO_BDD_WLD_WGS84G:bati_indifferencie,BDTOPO_BDD_WLD_WGS84G:bati_industriel',
        level: 16,
        projection: 'EPSG:4326',
        extent: {
            west: 2.334,
            east: 2.335,
            south: 48.849,
            north: 48.851,
        },
        ipr: 'IGN',
        options: {
            mimetype: 'json',
    },
}, globeView.tileLayer);

});

exports.view = globeView;
exports.initialPosition = positionOnGlobe;
