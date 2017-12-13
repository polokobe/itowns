import * as THREE from 'three';
import OBB from '../../../Renderer/ThreeExtended/OBB';
import Coordinates, { UNIT } from '../../Geographic/Coordinates';
import Extent from '../../Geographic/Extent';

function PanoramaTileBuilder(ratio) {
    this.tmp = {
        coords: new Coordinates('EPSG:4326', 0, 0),
        position: new THREE.Vector3(),
        normal: new THREE.Vector3(0, 0, 1),
    };

    if (!ratio) {
        throw new Error('ratio must be defined');
    }
    if (ratio === 2) {
        this.equirectangular = true;
        this.radius = 100;
    } else {
        this.equirectangular = false; // cylindrical proj
        this.height = 200;
        this.radius = (ratio * this.height) / (2 * Math.PI);
    }
}

PanoramaTileBuilder.prototype.constructor = PanoramaTileBuilder;

// prepare params
// init projected object -> params.projected
const axisX = new THREE.Vector3(0, 1, 0);
PanoramaTileBuilder.prototype.Prepare = function Prepare(params) {
    const angle = (params.extent.north(UNIT.RADIAN) + params.extent.south(UNIT.RADIAN)) * 0.5;

    if (this.equirectangular) {
        params.quatNormalToZ = new THREE.Quaternion().setFromAxisAngle(axisX, (Math.PI * 0.5 - angle));
        params.projected = {
            theta: 0,
            phi: 0,
            radius: this.radius,
        };
    } else {
        params.quatNormalToZ = new THREE.Quaternion().setFromAxisAngle(axisX, (Math.PI * 0.5));
        params.projected = {
            theta: 0,
            radius: this.radius,
            y: 0,
        };
    }
};

PanoramaTileBuilder.prototype.Center = function Center(params) {
    this.Prepare(params);

    this.uProjecte(0.5, params);
    this.vProjecte(0.5, params);

    params.center = this.VertexPosition(params).clone();

    return params.center;
};

// get position 3D cartesian
PanoramaTileBuilder.prototype.VertexPosition = function VertexPosition(params) {
    if (this.equirectangular) {
        this.tmp.position.setFromSpherical(params.projected);
    } else {
        this.tmp.position.setFromCylindrical(params.projected);
    }

    this.tmp.position.set(this.tmp.position.z, this.tmp.position.x, this.tmp.position.y);

    return this.tmp.position;
};

// get normal for last vertex
PanoramaTileBuilder.prototype.VertexNormal = function VertexNormal() {
    return this.tmp.position.clone().negate().normalize();
};

// coord u tile to projected
PanoramaTileBuilder.prototype.uProjecte = function uProjecte(u, params) {
    // both (theta, phi) and (y, z) are swapped in setFromSpherical
    params.projected.theta = Math.PI - THREE.Math.lerp(
        params.extent.east(UNIT.RADIAN),
        params.extent.west(UNIT.RADIAN),
        1 - u);
};

// coord v tile to projected
PanoramaTileBuilder.prototype.vProjecte = function vProjecte(v, params) {
    if (this.equirectangular) {
        params.projected.phi = Math.PI * 0.5 -
            THREE.Math.lerp(
                params.extent.north(UNIT.RADIAN),
                params.extent.south(UNIT.RADIAN),
                1 - v);
    } else {
        params.projected.y =
            this.height *
            THREE.Math.lerp(params.extent.south(), params.extent.north(), v) / 180;
    }
};

// get oriented bounding box of tile
PanoramaTileBuilder.prototype.OBB = function _OBB(boundingBox) {
    return new OBB(boundingBox.min, boundingBox.max);
};

PanoramaTileBuilder.prototype.getCommonGeometryExtent = function getCommonGeometryExtentFn(extent) {
    const sizeLongitude = Math.abs(extent.west() - extent.east()) / 2;
    const communExtent = new Extent(extent.crs(), -sizeLongitude, sizeLongitude, extent.south(), extent.north());
    communExtent._internalStorageUnit = extent._internalStorageUnit;
    return communExtent;
};

const axisY = new THREE.Vector3(0, 1, 0);
const axisZ = new THREE.Vector3(0, 0, 1);
const quatToAlignLongitude = new THREE.Quaternion();
const quatToAlignLatitude = new THREE.Quaternion();

PanoramaTileBuilder.prototype.getQuaternionFromExtent = function getQuaternionFromExtentFn(extentFrom, extentTo) {
    const rotLon = extentTo.west(UNIT.RADIAN) - extentFrom.west(UNIT.RADIAN);
    const rotLat = Math.PI * 0.5 - (!this.equirectangular ? 0 : (extentFrom.north(UNIT.RADIAN) + extentFrom.south(UNIT.RADIAN)) * 0.5);
    quatToAlignLongitude.setFromAxisAngle(axisZ, -rotLon);
    quatToAlignLatitude.setFromAxisAngle(axisY, -rotLat);
    return quatToAlignLongitude.multiply(quatToAlignLatitude);
};

export default PanoramaTileBuilder;
