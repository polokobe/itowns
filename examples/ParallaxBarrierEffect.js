// This file is copy pasted from itowns.THREE
/* eslint-disable */
/**
 * @author mrdoob / http://mrdoob.com/
 * @author marklundin / http://mark-lundin.com/
 * @author alteredq / http://alteredqualia.com/
 */
/* CUSTOM ITOWNS */
/* Add the camera as parameter, because it is needed below for the far */
function ParallaxBarrierEffect ( renderer, camera ) {
/* END CUSTOM ITOWNS */

    var _camera = new itowns.THREE.OrthographicCamera( - 1, 1, 1, - 1, 0, 1 );

    var _scene = new itowns.THREE.Scene();

    var _stereo = new itowns.THREE.StereoCamera();
    /* CUSTOM ITOWNS */
    /* Force the far of left/right cameras to avoid depth problem */
    _stereo.cameraL.far = camera.far;
    _stereo.cameraR.far = camera.far;
    /* END CUSTOM ITOWNS */

    var _params = { minFilter: itowns.THREE.LinearFilter, magFilter: itowns.THREE.NearestFilter, format: itowns.THREE.RGBAFormat };

    var _renderTargetL = new itowns.THREE.WebGLRenderTarget( 512, 512, _params );
    var _renderTargetR = new itowns.THREE.WebGLRenderTarget( 512, 512, _params );

    var _material = new itowns.THREE.ShaderMaterial( {

        uniforms: {

            "mapLeft": { value: _renderTargetL.texture },
            "mapRight": { value: _renderTargetR.texture }

        },

        vertexShader: [

            "varying vec2 vUv;",

            "void main() {",

            "	vUv = vec2( uv.x, uv.y );",
            "	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",

            "}"

        ].join( "\n" ),

        fragmentShader: [

            "uniform sampler2D mapLeft;",
            "uniform sampler2D mapRight;",
            "varying vec2 vUv;",

            "void main() {",

            "	vec2 uv = vUv;",

            "	if ( ( mod( gl_FragCoord.y, 2.0 ) ) > 1.00 ) {",

            "		gl_FragColor = texture2D( mapLeft, uv );",

            "	} else {",

            "		gl_FragColor = texture2D( mapRight, uv );",

            "	}",

            "}"

        ].join( "\n" )

    } );

    var mesh = new itowns.THREE.Mesh( new itowns.THREE.PlaneBufferGeometry( 2, 2 ), _material );
    _scene.add( mesh );

    this.setSize = function ( width, height ) {

        renderer.setSize( width, height );

        var pixelRatio = renderer.getPixelRatio();

        _renderTargetL.setSize( width * pixelRatio, height * pixelRatio );
        _renderTargetR.setSize( width * pixelRatio, height * pixelRatio );

    };

    this.render = function ( scene, camera ) {

        scene.updateMatrixWorld();

        if ( camera.parent === null ) camera.updateMatrixWorld();

        _stereo.update( camera );

        renderer.render( scene, _stereo.cameraL, _renderTargetL, true );
        renderer.render( scene, _stereo.cameraR, _renderTargetR, true );
        renderer.render( _scene, _camera );

    };

    /* CUSTOM ITOWNS */
    /* Add missing dispose method */
    this.dispose = function () {

        if ( _renderTargetL ) _renderTargetL.dispose();
        if ( _renderTargetR ) _renderTargetR.dispose();

    };
    /* END CUSTOM ITOWNS */

    /* CUSTOM ITOWNS */
    /* Add new updateEyeSep method */
    this.updateEyeSep = function ( value ) {

        _stereo.eyeSep = value;

    };
    /* END CUSTOM ITOWNS */

}
