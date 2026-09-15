export function parsePly(buffer) {
    const bytes = new Uint8Array(buffer);
    const headerMarker = "end_header";
    const propertyMarker = "property";
    let headerOffset = 0;
    let headerEndIndex = 0;
    let propertiesCount = 0;

    for (let i = 0; i < bytes.length - headerMarker.length; i++) {
        const chunk = String.fromCharCode.apply(null, Array.from(bytes.slice(i, i + headerMarker.length)));
        if (chunk === headerMarker) {
            headerEndIndex = i + headerMarker.length;
            headerOffset = headerEndIndex;
            while (bytes[headerOffset] === 10 || bytes[headerOffset] === 13) headerOffset++;
            break;
        }
    }

    const headerText = new TextDecoder().decode(bytes.slice(0, headerOffset));
    const lines = headerText.split('\n');
    const propertyNames = [];
    for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith(propertyMarker)) {
            const parts = line.split(/\s+/ );
            const propertyName = parts[2];
            propertyNames.push(propertyName);
        }
    }

    const propertiesPerVertex = propertyNames.length;
    const allFloats = new Float32Array(buffer.slice(headerOffset));
    const totalVertices = Math.floor(allFloats.length / propertiesPerVertex);

    const indices = {
        stride: propertiesPerVertex,
        x: propertyNames.indexOf("x"),
        y: propertyNames.indexOf("y"),
        z: propertyNames.indexOf("z"),
        opacityIndex: propertyNames.indexOf("opacity"),
        scale0Index: propertyNames.indexOf("scale_0"),
        scale1Index: propertyNames.indexOf("scale_1"),
        scale2Index: propertyNames.indexOf("scale_2")
    }
    return { allFloats, totalVertices , indices, headerText};

}

function median(arr) {
    const sorted = Array.from(arr).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Zwraca listę indeksów wierzchołków uznanych za "dobre" (bez szumu/artefaktów).
 * Odrzuca: zbyt niską opacity, nietypowo dużą skalę ("igły"), nietypowo dużą
 * odległość od mediany pozycji (odosobnione floaters).
 */
export function filterNoisyVertices(allFloats, totalVertices, indices, opts = {}) {
    const {
        opacityThreshold = 0.05,
        maxScaleFactor = 8,
        maxDistanceFactor = 6
    } = opts;

    const opacities = new Float32Array(totalVertices);
    const maxScales = new Float32Array(totalVertices);
    const xs = new Float32Array(totalVertices);
    const ys = new Float32Array(totalVertices);
    const zs = new Float32Array(totalVertices);

    for (let i = 0; i < totalVertices; i++) {
        const base = i * indices.stride;
        opacities[i] = 1.0 / (1.0 + Math.exp(-allFloats[base + indices.opacityIndex]));
        const s0 = Math.exp(allFloats[base + indices.scale0Index]);
        const s1 = Math.exp(allFloats[base + indices.scale1Index]);
        const s2 = Math.exp(allFloats[base + indices.scale2Index]);
        maxScales[i] = Math.max(s0, s1, s2);
        xs[i] = allFloats[base + indices.x];
        ys[i] = allFloats[base + indices.y];
        zs[i] = allFloats[base + indices.z];
    }

    const centerX = median(xs);
    const centerY = median(ys);
    const centerZ = median(zs);

    const distances = new Float32Array(totalVertices);
    for (let i = 0; i < totalVertices; i++) {
        const dx = xs[i] - centerX;
        const dy = ys[i] - centerY;
        const dz = zs[i] - centerZ;
        distances[i] = Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    const scaleLimit = median(maxScales) * maxScaleFactor;
    const distanceLimit = median(distances) * maxDistanceFactor;

    const kept = [];
    let rejOpacity = 0, rejScale = 0, rejDistance = 0;

    for (let i = 0; i < totalVertices; i++) {
        if (opacities[i] < opacityThreshold) { rejOpacity++; continue; }
        if (maxScales[i] > scaleLimit) { rejScale++; continue; }
        if (distances[i] > distanceLimit) { rejDistance++; continue; }
        kept.push(i);
    }

    console.log(
        `Czyszczenie PLY: zachowano ${kept.length}/${totalVertices} ` +
        `(odrzucono: opacity=${rejOpacity}, skala=${rejScale}, dystans=${rejDistance})`
    );

    return kept;
}

/**
 * Buduje treść nagłówka PLY i DOPEŁNIA go linią komentarza tak, by całkowita
 * długość nagłówka w bajtach była wielokrotnością 4 — inaczej blok danych
 * binarnych (odczytywany jako Float32Array) zaczynałby się z przesunięciem
 * o 1-3 bajty, co daje losowe/ekstremalne wartości (objaw: "kolorowe linie").
 */
function buildDynamicAlignedHeader(originalHeaderText, newCount) {
    let header = originalHeaderText.replace(/element vertex \d+/, `element vertex ${newCount}`);
    header = header.replace(/comment align_pad_.*\n/, '');

    const endHeaderIndex = header.indexOf('end_header');
    const beforeEnd = header.slice(0, endHeaderIndex);
    const endPart = header.slice(endHeaderIndex);

    const baseLength = new TextEncoder().encode(beforeEnd + endPart).length;
    const minCommentLength = 9;
    const remainder = (baseLength + minCommentLength) % 4;
    const fillerLen = (4 - remainder) % 4;
    const commentLine = `comment align_pad_${fillerLen} \n`;

    return beforeEnd + commentLine + endPart;
}

export function buildPlySubset(allFloats, vertexIndexes, stride, originalHeaderText) {
    const count = vertexIndexes.length;
    const header = buildDynamicAlignedHeader(originalHeaderText, count);
    const headerBytes = new TextEncoder().encode(header);
    const dataFloats = new Float32Array(count * stride);

    for (let i = 0; i < count; i++) {
        const base = vertexIndexes[i] * stride;
        const dstBase = i * stride;
        dataFloats.set(allFloats.subarray(base, base + stride), dstBase);
    }

    const totalBytes = headerBytes.length + dataFloats.byteLength;
    const outBuffer = new ArrayBuffer(totalBytes);
    const outView = new Uint8Array(outBuffer);
    outView.set(headerBytes, 0);
    outView.set(new Uint8Array(dataFloats.buffer), headerBytes.length);
    return outBuffer;
}

export function plyBufferToBlobUrl(arrayBuffer) {
    const blob = new Blob([arrayBuffer], { type: 'application/octet-stream' });
    return URL.createObjectURL(blob);
}