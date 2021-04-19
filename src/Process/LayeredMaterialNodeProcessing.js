import { chooseNextLevelToFetch } from 'Layer/LayerUpdateStrategy';
import LayerUpdateState from 'Layer/LayerUpdateState';
import handlingError from 'Process/handlerNodeError';

export const SIZE_TEXTURE_TILE = 256;
export const SIZE_DIAGONAL_TEXTURE = Math.pow(2 * (SIZE_TEXTURE_TILE * SIZE_TEXTURE_TILE), 0.5);

function materialCommandQueuePriorityFunction(material) {
    // We know that 'node' is visible because commands can only be
    // issued for visible nodes.
    // TODO: need priorization of displayed nodes
    // Then prefer displayed node over non-displayed one
    return material.visible ? 100 : 10;
}

function refinementCommandCancellationFn(cmd) {
    if (!cmd.requester.parent || !cmd.requester.material) {
        return true;
    }
    // Cancel the command if the tile already has a better texture.
    // This is only needed for elevation layers, because we may have several
    // concurrent layers but we can only use one texture.
    if (cmd.layer.isElevationLayer && cmd.requester.material.getElevationLayer() &&
        cmd.targetLevel <= cmd.requester.material.getElevationLayer().level) {
        return true;
    }

    return !cmd.requester.material.visible;
}

function buildCommand(view, layer, extentsSource, extentsDestination, requester, features) {
    return {
        view,
        layer,
        extentsSource,
        extentsDestination,
        requester,
        features,
        priority: materialCommandQueuePriorityFunction(requester.material),
        earlyDropFunction: refinementCommandCancellationFn,
    };
}

export function updateLayeredMaterialNodeImagery(context, layer, node, parent) {
    const material = node.material;
    if (!parent || !material) {
        return;
    }
    const extentsDestination = node.getExtentsByProjection(layer.crs);

    const zoom = extentsDestination[0].zoom;
    if (zoom > layer.zoom.max || zoom < layer.zoom.min) {
        return;
    }

    let nodeLayer = material.getLayer(layer.id);

    // Initialisation
    if (node.layerUpdateState[layer.id] === undefined) {
        node.layerUpdateState[layer.id] = new LayerUpdateState();

        if (!layer.source.extentInsideLimit(node.extent, zoom)) {
            // we also need to check that tile's parent doesn't have a texture for this layer,
            // because even if this tile is outside of the layer, it could inherit it's
            // parent texture
            if (!layer.noTextureParentOutsideLimit &&
                parent.material &&
                parent.material.getLayer &&
                parent.material.getLayer(layer.id)) {
                // ok, we're going to inherit our parent's texture
            } else {
                node.layerUpdateState[layer.id].noMoreUpdatePossible();
                return;
            }
        }

        if (!nodeLayer) {
            // Create new raster node
            nodeLayer = layer.setupRasterNode(node);

            // Init the node by parent
            const parentLayer = parent.material && parent.material.getLayer(layer.id);
            nodeLayer.initFromParent(parentLayer, extentsDestination);
        }

        // Proposed new process, two separate processes:
        //      * FIRST PASS: initNodeXXXFromParent and get out of the function
        //      * SECOND PASS: Fetch best texture

        // The two-step allows you to filter out unnecessary requests
        // Indeed in the second pass, their state (not visible or not displayed) can block them to fetch
        if (nodeLayer.level >= layer.source.zoom.min) {
            context.view.notifyChange(node, false);
            return;
        }
    }

    // Node is hidden, no need to update it
    if (!material.visible) {
        return;
    }

    // An update is pending / or impossible -> abort
    if (!layer.visible || !node.layerUpdateState[layer.id].canTryUpdate()) {
        return;
    }

    if (nodeLayer.level >= extentsDestination[0].zoom) {
        // default decision method
        node.layerUpdateState[layer.id].noMoreUpdatePossible();
        return;
    }

    // is fetching data from this layer disabled?
    if (layer.frozen) {
        return;
    }

    const failureParams = node.layerUpdateState[layer.id].failureParams;
    const destinationLevel = extentsDestination[0].zoom || node.level;
    const targetLevel = chooseNextLevelToFetch(layer.updateStrategy.type, node, destinationLevel, nodeLayer.level, layer, failureParams);

    if ((!layer.source.isVectorSource && targetLevel <= nodeLayer.level) || targetLevel > destinationLevel) {
        if (failureParams.lowestLevelError != Infinity) {
            // this is the highest level found in case of error.
            node.layerUpdateState[layer.id].noMoreUpdatePossible();
        }
        return;
    } else if (!layer.source.extentInsideLimit(node.extent, targetLevel)) {
        node.layerUpdateState[layer.id].noData({ targetLevel });
        context.view.notifyChange(node, false);
        return;
    }

    const extentsSource = extentsDestination.map(e => e.tiledExtentParent(targetLevel));
    node.layerUpdateState[layer.id].newTry();
    const features = nodeLayer.textures.map(t => layer.isValidData(t.features));
    const command = buildCommand(context.view, layer, extentsSource, extentsDestination, node, features);

    return context.scheduler.execute(command).then(
        (result) => {
            // TODO: Handle error : result is undefined in provider. throw error
            const pitchs = extentsDestination.map((ext, i) => ext.offsetToParent(result[i].extent, nodeLayer.offsetScales[i]));
            nodeLayer.setTextures(result, pitchs);
            node.layerUpdateState[layer.id].success();
        },
        err => handlingError(err, node, layer, targetLevel, context.view));
}

export function updateLayeredMaterialNodeElevation(context, layer, node, parent) {
    const material = node.material;
    if (!parent || !material) {
        return;
    }

    // TODO: we need either
    //  - compound or exclusive layers
    //  - support for multiple elevation layers

    // Elevation is currently handled differently from color layers.
    // This is caused by a LayeredMaterial limitation: only 1 elevation texture
    // can be used (where a tile can have N textures x M layers)
    const extentsDestination = node.getExtentsByProjection(layer.crs);
    const zoom = extentsDestination[0].zoom;
    if (zoom > layer.zoom.max || zoom < layer.zoom.min) {
        return;
    }
    // Init elevation layer, and inherit from parent if possible
    let nodeLayer = material.getElevationLayer();
    if (!nodeLayer) {
        nodeLayer = layer.setupRasterNode(node);
    }

    if (node.layerUpdateState[layer.id] === undefined) {
        node.layerUpdateState[layer.id] = new LayerUpdateState();

        const parentLayer = parent.material && parent.material.getLayer(layer.id);
        nodeLayer.initFromParent(parentLayer, extentsDestination);

        if (nodeLayer.level >= layer.source.zoom.min) {
            context.view.notifyChange(node, false);
            return;
        }
    }

    // Possible conditions to *not* update the elevation texture
    if (layer.frozen ||
            !material.visible ||
            !node.layerUpdateState[layer.id].canTryUpdate()) {
        return;
    }

    const failureParams = node.layerUpdateState[layer.id].failureParams;
    const targetLevel = chooseNextLevelToFetch(layer.updateStrategy.type, node, extentsDestination[0].zoom, nodeLayer.level, layer, failureParams);

    if (targetLevel <= nodeLayer.level || targetLevel > extentsDestination[0].zoom) {
        node.layerUpdateState[layer.id].noMoreUpdatePossible();
        return;
    } else if (!layer.source.extentInsideLimit(node.extent, targetLevel)) {
        node.layerUpdateState[layer.id].noData({ targetLevel });
        context.view.notifyChange(node, false);
        return;
    }

    const extentsSource = extentsDestination.map(e => e.tiledExtentParent(targetLevel));
    node.layerUpdateState[layer.id].newTry();
    const command = buildCommand(context.view, layer, extentsSource, extentsDestination, node);

    return context.scheduler.execute(command).then(
        (result) => {
            // Do not apply the new texture if its level is < than the current
            // one.  This is only needed for elevation layers, because we may
            // have several concurrent layers but we can only use one texture.
            if (targetLevel <= nodeLayer.level) {
                node.layerUpdateState[layer.id].noMoreUpdatePossible();
                return;
            }
            const pitchs = extentsDestination.map((ext, i) => ext.offsetToParent(result[i].extent, nodeLayer.offsetScales[i]));
            nodeLayer.setTextures(result, pitchs);
            node.layerUpdateState[layer.id].success();
        },
        err => handlingError(err, node, layer, targetLevel, context.view));
}

export function removeLayeredMaterialNodeLayer(layerId) {
    return function removeLayeredMaterialNodeLayer(node) {
        if (node.material && node.material.removeLayer) {
            node.material.removeLayer(layerId);
            if (node.material.elevationLayerIds[0] == layerId) {
                node.setBBoxZ(0, 0);
            }
        }
        if (node.layerUpdateState && node.layerUpdateState[layerId]) {
            delete node.layerUpdateState[layerId];
        }
    };
}
