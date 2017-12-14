import * as THREE from 'three';
import AnimationPlayer, { AnimatedExpression } from '../../Core/AnimationPlayer';
import GlobeControls from './GlobeControls';
import ImmersiveControls from './ImmersiveControls';

// import Coordinates, { ellipsoidSizes } from '../../Core/Geographic/Coordinates';
import { ellipsoidSizes } from '../../Core/Geographic/Coordinates';

    // Expression used to damp camera's moves
function moveCameraExp(root, progress) {
    root.camera.position.lerpVectors(root.positionFrom, root.positionTo, progress);
}

const size = ellipsoidSizes().x;

function onKeyDown(e) {
    // eslint-disable-next-line no-console
    console.log('ControlsSwitcher get key down event : ', e.keyCode);

    // key Space
    if (e.keyCode == 32) {
        // eslint-disable-next-line no-console
        console.log('NEED TO SWITCH CONTROLS NOW !!');
        if (this.state == this.STATES.IMMERSIVE) {
            this.controls.dispose();
            // const coordCarto = new Coordinates('EPSG:4978', this.camera.position.x, this.camera.position.y, this.camera.position.z).as('EPSG:4326');
            // coordCarto.setAltitude(5000);
            if (!this.globeControls) {
                this.globeControls = new GlobeControls(this.view, this.camera.position.clone(), size, { handleCollision: false });
                this.globeControls.minDistance = 0;
            } else {
                this.globeControls.enabled = true;
                this.globeControls.enableKeys = true;
                this.globeControls.resetControls();

                // TODO UPDATE CAMERA
                // this.globeControls.camera.position.set(this.controls.camera.position.clone());
            }
            this.state = this.STATES.GLOBE;
        } else if (this.state == this.STATES.GLOBE) {
            this.globeControls.enabled = false;
            this.globeControls.enableKeys = false;
            this.globeControls.resetControls();
            this.globeControls.state = this.globeControls.states.NONE;

            this.controls = new ImmersiveControls(this.view);
            this.state = this.STATES.IMMERSIVE;

            // eslint-disable-next-line
            for (const i in this.layers) {
                this.controls.addLayer(this.layers[i]);
            }
            this.controls.setCameraToCurrentPano();
        }
    }
}
function update2() {
    this.view.notifyChange(true, this.view);
}
class ControlsSwitcher extends THREE.EventDispatcher {

    constructor(view, controlsList, options = {}) {
        super();

        this.STATES = {
            IMMERSIVE: 0,
            GLOBE: 1,
        };

        this.state = this.STATES.IMMERSIVE;

        this.camera = view.camera.camera3D;
        this.view = view;
        this.options = options;

        // this.globeControls = new GlobeControls(this.view);
        // this.globeControls.dispose();

        this.controls = new ImmersiveControls(this.view);
        this.layers = [];

        this.player = new AnimationPlayer();
        this.animationMoveCamera = new AnimatedExpression({ duration: 5, root: this, expression: moveCameraExp, name: 'Move camera' });

        const domElement = view.mainLoop.gfxEngine.renderer.domElement;
        domElement.addEventListener('keydown', onKeyDown.bind(this), true);
        this.player.addEventListener('animation-frame', update2.bind(this));
    }

    switchMode() {
        if (this.state == this.STATES.IMMERSIVE) {
            this.controls.dispose();
            // const coordCarto = new Coordinates('EPSG:4978', this.camera.position.x, this.camera.position.y, this.camera.position.z).as('EPSG:4326');
            // coordCarto.setAltitude(5000);
            if (!this.globeControls) {
                this.globeControls = new GlobeControls(this.view, this.camera.position.clone(), size, { handleCollision: false });
                this.globeControls.minDistance = 0;
            } else {
                this.globeControls.enabled = true;
                this.globeControls.enableKeys = true;
                this.globeControls.resetControls();

                // TODO UPDATE CAMERA
                // this.globeControls.camera.position.set(this.controls.camera.position.clone());
            }
            this.state = this.STATES.GLOBE;
        } else if (this.state == this.STATES.GLOBE) {
            this.globeControls.enabled = false;
            this.globeControls.enableKeys = false;
            this.globeControls.resetControls();
            this.globeControls.state = this.globeControls.states.NONE;

            this.controls = new ImmersiveControls(this.view);
            this.state = this.STATES.IMMERSIVE;

            // eslint-disable-next-line
            for (const i in this.layers) {
                this.controls.addLayer(this.layers[i]);
            }
            this.controls.setCameraToCurrentPano();
        }
    }

    moveCameraTo(positionTo) {
        this.positionFrom = this.camera.position.clone();
        this.positionTo = positionTo;
        this.player.play(this.animationMoveCamera);
    }

    addLayer(layer) {
        if (this.controls instanceof ImmersiveControls) {
            this.controls.addLayer(layer);
            this.layers.push(layer);
        } else {
            // eslint-disable-next-line no-console
            console.log('ControlSwitcher: addLayer called out of ImmersiveControls');
        }
    }
    nextLayer() {
        if (this.controls instanceof ImmersiveControls) {
            this.controls.nextLayer();
        } else {
            // eslint-disable-next-line no-console
            console.log('ControlSwitcher: NextLayer called out of ImmersiveControls');
        }
    }
    setCameraToCurrentPano() {
        if (this.controls instanceof ImmersiveControls) {
            this.controls.setCameraToCurrentPano();
        } else {
            // eslint-disable-next-line no-console
            console.log('ControlSwitcher: setCameraToCurrentPano called out of ImmersiveControls');
        }
    }
}

export default ControlsSwitcher;
