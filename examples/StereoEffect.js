// This file is copy pasted from THREE
/* eslint-disable */
/**
 * @author alteredq / http://alteredqualia.com/
 * @author mrdoob / http://mrdoob.com/
 * @author arodic / http://aleksandarrodic.com/
 * @author fonserbc / http://fonserbc.github.io/
*/

/* CUSTOM ITOWNS */
/* Add the camera as parameter, because it is needed below for the far */
function StereoEffect ( renderer, camera ) {
/* END CUSTOM ITOWNS */

    var _stereo = new itowns.THREE.StereoCamera();
    _stereo.aspect = 0.5;
    /* CUSTOM ITOWNS */
    /* Force the far of left/right cameras to avoid depth problem */
    _stereo.cameraL.far = camera.far;
    _stereo.cameraR.far = camera.far;
    _stereo.cameraL.layers = camera.layers;
    _stereo.cameraR.layers = camera.layers;
    /* END CUSTOM ITOWNS */

    this.setSize = function ( width, height ) {

        renderer.setSize( width, height );

    };

    this.render = function ( scene, camera ) {

        scene.updateMatrixWorld();

        if ( camera.parent === null ) camera.updateMatrixWorld();

        _stereo.update( camera );

        var size = renderer.getSize();

        if ( renderer.autoClear ) renderer.clear();
        renderer.setScissorTest( true );

        renderer.setScissor( 0, 0, size.width / 2, size.height );
        renderer.setViewport( 0, 0, size.width / 2, size.height );
        renderer.render( scene, _stereo.cameraL );

        renderer.setScissor( size.width / 2, 0, size.width / 2, size.height );
        renderer.setViewport( size.width / 2, 0, size.width / 2, size.height );
        renderer.render( scene, _stereo.cameraR );

        renderer.setScissorTest( false );

    };

    /* CUSTOM ITOWNS */
    /* Add new updateEyeSep method */
    this.updateEyeSep = function ( value ) {

        _stereo.eyeSep = value;

    };
    /* END CUSTOM ITOWNS */

}
