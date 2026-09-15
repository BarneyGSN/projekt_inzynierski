let activeLayers = []

export function setupLayerManager (fileListElement, splatViewer, scene) {
    fileListElement.addEventListener('file-removed', (event) => {
        const {id} = event.detail;
        removeLayer(id, splatViewer, scene, fileListElement)
    });
}

export function registerLayer (layerData, fileListElement) {
    activeLayers.push(layerData)
    fileListElement.files = [...activeLayers]
}

export async function removeLayer(id, splatViewer, scene, fileListElement) {
    const layerIndex = activeLayers.findIndex(layer => layer.id === id);
    if (layerIndex === -1) return;

    const layer = activeLayers[layerIndex];
    if (layer.mesh !== undefined && layer.mesh !== null && splatViewer) {
        try {
            await splatViewer.removeSplatScene(layer.mesh);
        } catch (err) {
            console.error("Błąd podczas removeSplatScene:", err);
        }
    }

    if (layer.blobUrl) {
        URL.revokeObjectURL(layer.blobUrl);
    }

    activeLayers.splice(layerIndex, 1);
    activeLayers.forEach((l, idx) => l.mesh = idx)

    fileListElement.files = [...activeLayers];

    splatViewer.update();
    splatViewer.render();
}