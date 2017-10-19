/* global itowns, document, renderer */
// # Simple Globe viewer

// Define initial camera position
var positionOnGlobe = { longitude: 2.362552, latitude: 48.874245, altitude: 50};
// var positionOnGlobe = { longitude: 2.391864678818233, latitude: 48.889957901766138, altitude: 80 };
// var positionOnGlobe = { longitude: 4.818, latitude: 45.7354, altitude: 3000 };
var promises = [];

// `viewerDiv` will contain iTowns' rendering area (`<canvas>`)
var viewerDiv = document.getElementById('viewerDiv');

// Instanciate iTowns GlobeView*
var globeView = new itowns.GlobeView(viewerDiv, positionOnGlobe, { 
    // controlsSwitcher: true, 
    immersiveControls: true, 
    renderer: renderer, 
    handleCollision: false });
function addLayerCb(layer) {
    return globeView.addLayer(layer);
}

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

globeView.addLayer({
    type: 'geometry',
    update: itowns.OrientedImageProcessing.update(),
    images: 'http://localhost:8080/examples/Egout/stereopolis/Paris-150611_0504-{sensorId}-00010_00{imageId}.jpg',
    orientations: 'http://localhost:8080/examples/Egout/stereopolis_pano.json',
    calibrations: 'http://localhost:8080/examples/Egout/stereopolis_camera.json',
    protocol: 'orientedimage',
    sphereRadius: 50,
    id: 'stereopolis',
    level: 16,
    projection: 'EPSG:2154',
    view: globeView,
    crsOut: globeView.referenceCrs,
    orientationType: 'Stereopolis2',
    options: {
        mimetype: 'geojson',
    },
}, globeView.tileLayer).then(result => {
    globeView.controls.addLayer(result);
    globeView.addLayer({
        type: 'geometry',
        update: itowns.FeatureProcessing.update,
        url: 'http://wxs.ign.fr/72hpsel8j8nhb5qgdh07gcyp/geoportail/wfs?',
        convert: itowns.Feature2Mesh.convert({
        altitude: altitudeBuildings,
        extrude: extrudeBuildings }),
        onMeshCreated: function setMaterial(res) { res.children[0].material = result.shaderMat; },
        protocol: 'wfs',
        version: '2.0.0',
        id: 'wfsBuilding',
        typeName: 'BDTOPO_BDD_WLD_WGS84G:bati_remarquable,BDTOPO_BDD_WLD_WGS84G:bati_indifferencie,BDTOPO_BDD_WLD_WGS84G:bati_industriel',
        level: 16,
        projection: 'EPSG:4326',
        extent: {
            west: 2.35,
            east: 2.37,
            south: 48.86,
            north: 48.88,
        },
        ipr: 'IGN',
        options: {
            mimetype: 'json',
    },
}, globeView.tileLayer);

});

globeView.addLayer({
    type: 'geometry',
    update: itowns.OrientedImageProcessing.update(),
    images: 'http://localhost:8080/examples/Egout/egout/image_{sensorId}_{imageId}.jpg',
    orientations: 'http://localhost:8080/examples/Egout/egout_pano.json',
    calibrations: 'http://localhost:8080/examples/Egout/egout_camera.json',
    protocol: 'orientedimage',
    offset: {x: 650000, y: 6860000, z: -43.795},
    // version: '2.0.0',
    id: 'demo_orientedImage',
    // typeName: 'tcl_sytral.tcllignebus',
    level: 16,
    projection: 'EPSG:2154',
    view: globeView,
    crsOut: globeView.referenceCrs,
    options: {
        mimetype: 'geojson',
    },
}, globeView.tileLayer).then(result => {
    globeView.controls.addLayer(result);
    var loader = new itowns.THREE.PLYLoader();

    loader.load('http://localhost:8080/examples/Egout/egout.ply', function (geometry) {
        var meshLayer = new itowns.GeometryLayer('mesh', globeView.scene);
        meshLayer.update = function() {};
        meshLayer.name = 'Mesh Layer';
        meshLayer.overrideMaterials = true;  // custom cesium shaders are not functional
        meshLayer.type = 'geometry';
        meshLayer.visible = true;
        globeView.addLayer(meshLayer);
        // console.log(geometry);
        // var material = new itowns.THREE.MeshPhongMaterial({ color: 0x7777ff, side: itowns.THREE.DoubleSide, transparent: true, opacity: 0.5, wireframe: true });
        var material = result.shaderMat;
        var mesh = new itowns.THREE.Mesh( geometry, material );
        mesh.position.copy(new itowns.THREE.Vector3().set(4199000,173000,4781000));
        mesh.updateMatrixWorld();
        mesh.layer = meshLayer.id;
        globeView.scene.add( mesh );
        // var mesh2 = new itowns.THREE.Mesh( geometry, new itowns.THREE.MeshBasicMaterial({ color: 0xff0000, side: itowns.THREE.DoubleSide, transparent: true, opacity: 0.8, wireframe: true }));
        // mesh2.position.copy(new itowns.THREE.Vector3().set(4199000,173000,4781000));
        // mesh2.updateMatrixWorld();
        // mesh2.layer = meshLayer.id;
        // globeView.scene.add( mesh2 );
    });
});

globeView.wgs84TileLayer.sseSubdivisionThreshold = 10;

exports.view = globeView;
exports.initialPosition = positionOnGlobe;
