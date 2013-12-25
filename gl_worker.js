importScripts('lib/libtess.cat.js');
importScripts('geo.js');
importScripts('gl.js');
importScripts('gl_builders.js');
importScripts('vector_renderer.js');
importScripts('styles.js'); // TODO: a better way to pass styles, doing this because functions can't be passed to workers

var debug = false;

this.addEventListener('message', function (event) {
    var tile = event.data.tile;

    var layers = event.data.layers;
    var styles = gl_styles;

    var layer, style;
    var triangles = [];
    var lines = [];

    // Mercator projection
    VectorRenderer.prototype.projectTile(tile);

    // Build raw geometry arrays
    tile.debug.features = 0;
    for (var ln=0; ln < layers.length; ln++) {
        layer = layers[ln];
        style = styles[layer.name] || {};

        if (tile.layers[layer.name] != null) {
            var num_features = tile.layers[layer.name].features.length;
            tile.debug.features += num_features;
            for (var f=0; f < num_features; f++) {
                var feature = tile.layers[layer.name].features[f];

                if (feature.geometry.type == 'Polygon') {
                    GLRenderer.buildPolygons([feature.geometry.coordinates], feature, layer, style, tile, triangles);
                }
                else if (feature.geometry.type == 'MultiPolygon') {
                    GLRenderer.buildPolygons(feature.geometry.coordinates, feature, layer, style, tile, triangles);
                }
                else if (feature.geometry.type == 'LineString') {
                    GLRenderer.buildPolylines([feature.geometry.coordinates], feature, layer, style, tile, triangles, lines);
                }
                else if (feature.geometry.type == 'MultiLineString') {
                    GLRenderer.buildPolylines(feature.geometry.coordinates, feature, layer, style, tile, triangles, lines);
                }
            }
        }
    }

    triangles = new Float32Array(triangles);
    lines = new Float32Array(lines);

    this.postMessage({ key: tile.key, debug: tile.debug, triangles: triangles, lines: lines }, [triangles.buffer, lines.buffer]);
});
