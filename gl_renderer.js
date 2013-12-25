GLRenderer.prototype = Object.create(VectorRenderer.prototype);
GLRenderer.debug = false;

function GLRenderer (leaflet, layers)
{
    VectorRenderer.apply(this, arguments);

    // Defines the vertex buffer layout for the program
    // this.program_layout = {
    //     attribs: [
    //         {
    //             name: 'position',
    //             components: 3,
    //             type: WebGLRenderingContext.FLOAT,
    //             normalized: false
    //         },
    //         {
    //             name: 'normal',
    //             components: 3,
    //             type: WebGLRenderingContext.FLOAT,
    //             normalized: false
    //         },
    //         {
    //             name: 'color',
    //             components: 3,
    //             type: WebGLRenderingContext.FLOAT,
    //             normalized: false
    //         }
    //     ]
    // };
}

GLRenderer.prototype.init = function GLRendererInit ()
{
    this.gl = GL.getContext();
    this.program = GL.createProgramFromURLs(this.gl, 'vertex.glsl', 'fragment.glsl');
    // this.program_layout = GL.makeProgramLayout(this.gl, this.program, this.program_layout);
    this.last_render_count = null;

    this.zoom = this.leaflet.map.getZoom();
    this.zoom_step = 0.02; // for fractional zoom user adjustment
    this.map_last_zoom = this.leaflet.map.getZoom();
    this.map_zooming = false;

    this.initMapHandlers();
    this.initInputHandlers();

    // Web workers handle heavy duty geometry processing
    this.workers = [];
    this.workers[0] = new Worker('gl_worker.js');
    this.workers[1] = new Worker('gl_worker.js');
    this.next_worker = 0;

    var renderer = this;
    this.workers.forEach(function(worker) {
        worker.addEventListener('message', renderer.tileWorkerCompleted.bind(renderer));
    });
};

// Leaflet map/layer handlers
GLRenderer.prototype.initMapHandlers = function GLRendererInitMapHandlers ()
{
    var renderer = this;

    this.leaflet.map.on('zoomstart', function () {
        console.log("map.zoomstart " + renderer.leaflet.map.getZoom());
        renderer.map_last_zoom = renderer.leaflet.map.getZoom();
        renderer.map_zooming = true;
    });

    this.leaflet.map.on('zoomend', function () {
        console.log("map.zoomend " + renderer.leaflet.map.getZoom());
        renderer.map_zooming = false;

        // Schedule GL tiles for removal on zoom
        // console.log("renderer.map_last_zoom: " + renderer.map_last_zoom);
        var map_zoom = renderer.leaflet.map.getZoom();
        var below = map_zoom;
        var above = map_zoom;
        if (Math.abs(map_zoom - renderer.map_last_zoom) == 1) {
            if (map_zoom > renderer.map_last_zoom) {
                below = map_zoom - 1;
            }
            else {
                above = map_zoom + 1;
            }
        }
        renderer.removeTilesOutsideZoomRange(below, above);
        renderer.map_last_zoom = map_zoom;
    });

    this.leaflet.layer.on('tileunload', function (event) {
        var tile = event.tile;
        var key = tile.getAttribute('data-tile-key');
        if (key && renderer.tiles[key]) {
            if (renderer.map_zooming == false) {
                console.log("unload " + key);
                renderer.removeTile(key);
            }
        }
    });
};

// User input
GLRenderer.prototype.initInputHandlers = function GLRendererInitInputHandlers ()
{
    var gl_renderer = this;
    gl_renderer.key = null;

    document.addEventListener('keydown', function (event) {
        if (event.keyCode == 37) {
            gl_renderer.key = 'left';
        }
        else if (event.keyCode == 39) {
            gl_renderer.key = 'right';
        }
        else if (event.keyCode == 38) {
            gl_renderer.key = 'up';
        }
        else if (event.keyCode == 40) {
            gl_renderer.key = 'down';
        }
    });

    document.addEventListener('keyup', function (event) {
        gl_renderer.key = null;
    });
};

// Called when a web worker completes processing for a single tile
GLRenderer.prototype.tileWorkerCompleted = function (event)
{
    var renderer = this;
    var triangles = event.data.triangles;
    var lines = event.data.lines;
    var key = event.data.key;
    var tile = renderer.tiles[key];

    // Create GL geometry objects
    tile.gl_geometry = [];
    if (triangles.length > 0) {
        tile.gl_geometry.push(new GLTriangles(renderer.gl, renderer.program, triangles));
    }
    if (lines.length > 0) {
        tile.gl_geometry.push(new GLLines(renderer.gl, renderer.program, lines, { line_width: 1 }));
    }
    tile.geometry_count = tile.gl_geometry.reduce(function(sum, geom) { return sum + geom.geometry_count; }, 0);

    tile.debug = event.data.debug;
    tile.debug.geometries = tile.geometry_count;
    tile.debug.geom_ratio = (tile.debug.geometries / tile.debug.features).toFixed(1);
    renderer.printDebugForTile(tile);
};

GLRenderer.prototype.addTile = function GLRendererAddTile (tile, tileDiv)
{
    // Hand off feature data to worker for geometry construction
    this.workers[this.next_worker].postMessage({
        layers: this.layers.map(function(layer) {
            return { 
                name: layer.name, 
                number: layer.number
            };
        }),
        tile: {
            key: tile.key,
            coords: tile.coords,
            layers: tile.layers,
            debug: tile.debug
        }
    });
    this.next_worker = (this.next_worker + 1) % this.workers.length;

    // Selection - experimental/future
    // var gl_renderer = this;
    // var pixel = new Uint8Array(4);
    // tileDiv.onmousemove = function (event) {
    //     // console.log(event.offsetX + ', ' + event.offsetY + ' | ' + parseInt(tileDiv.style.left) + ', ' + parseInt(tileDiv.style.top));
    //     var p = Point(
    //         event.offsetX + parseInt(tileDiv.style.left),
    //         event.offsetY + parseInt(tileDiv.style.top)
    //     );
    //     gl_renderer.gl.readPixels(p.x, p.y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    //     console.log(p.x + ', ' + p.y + ': (' + pixel[0] + ', ' + pixel[1] + ', ' + pixel[2] + ', ' + pixel[3] + ')');
    // };
};

GLRenderer.prototype.removeTile = function GLRendererRemoveTile (key)
{
    if (this.tiles[key] != null && this.tiles[key].gl_geometry != null) {
        this.tiles[key].gl_geometry.forEach(function (gl_geometry) { gl_geometry.destroy(); });
        this.tiles[key].gl_geometry = null;
    }
    VectorRenderer.prototype.removeTile.apply(this, arguments);
};

GLRenderer.prototype.removeTilesOutsideZoomRange = function (below, above)
{
    console.log("removeTilesOutsideZoomRange [" + below + ", " + above + "])");
    var remove_tiles = [];
    for (var t in this.tiles) {
        var tile = this.tiles[t];
        if (tile.coords.z < below || tile.coords.z > above) {
            remove_tiles.push(t);
        }
    }
    for (var r=0; r < remove_tiles.length; r++) {
        var key = remove_tiles[r];
        console.log("removed " + key + " (outside range [" + below + ", " + above + "])");
        this.removeTile(key);
    }
};

// Continuous zoom: maintains a floating point zoom and syncs with leaflet to set an integer zoom
GLRenderer.prototype.setZoom = function (z) {
    var base = Math.floor(z);
    var fraction = z % 1.0;
    var map = this.leaflet.map;
    if (base != map.getZoom()) {
        if (base > map.getMaxZoom()) {
            base = map.getMaxZoom();
            fraction = 0.99;
        }
        else if (base < map.getMinZoom()) {
            base = map.getMinZoom();
        }
        this.zoom = base + fraction;
        map.setZoom(base, { animate: false });
    }
    else {
        this.zoom = z;
    }
};

GLRenderer.prototype.input = function GLRendererInput ()
{
    // Fractional zoom scaling
    if (this.key == 'up') {
        this.setZoom(this.zoom + this.zoom_step);
    }
    else if (this.key == 'down') {
        this.setZoom(this.zoom - this.zoom_step);
    }
};

GLRenderer.prototype.render = function GLRendererRender ()
{
    var gl = this.gl;

    this.input();

    if (!this.program) {
        return;
    }
    gl.useProgram(this.program);

    // Sync zoom w/leaflet
    if (Math.floor(this.zoom) != this.leaflet.map.getZoom()) {
        this.zoom = this.leaflet.map.getZoom();
    }

    // Set values to this.program variables
    gl.uniform2f(gl.getUniformLocation(this.program, 'resolution'), gl.canvas.width, gl.canvas.height);

    var center = this.leaflet.map.getCenter(); // TODO: move map center tracking/projection to central class?
    center = Geo.latLngToMeters(Point(center.lng, center.lat));
    gl.uniform2f(gl.getUniformLocation(this.program, 'map_center'), center.x, center.y);
    gl.uniform1f(gl.getUniformLocation(this.program, 'map_zoom'), this.zoom);
    // gl.uniform1f(gl.getUniformLocation(this.program, 'map_zoom'), Math.floor(this.zoom) + (Math.log((this.zoom % 1) + 1) / Math.LN2)); // scale fractional zoom by log

    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    // Render tile GL geometries
    var count = 0;
    for (var t in this.tiles) {
        var tile = this.tiles[t];
        if (tile.loaded == true && tile.coords.z == (this.zoom << 0)) {
            if (tile.gl_geometry != null) {
                tile.gl_geometry.forEach(function (gl_geometry) {
                    gl_geometry.render();
                    count += gl_geometry.geometry_count;
                });
            }
        }
    }

    if (count != this.last_render_count) {
        console.log("rendered " + count + " primitives");
    }
    this.last_render_count = count;
};

GLRenderer.aboutEqual = function (a, b, tolerance)
{
    tolerance = tolerance || 1;
    return (Math.abs(a - b) < tolerance);
};
