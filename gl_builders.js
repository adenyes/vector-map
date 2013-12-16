var GL = GL || {};

GL.buildPolygons = function buildPolygons (polygons, feature, layer, style, tile, vertex_data)
{
    // To ensure layers draw in order, offset z coordinate by one centimeter per layer
    // TODO: use glPolygonOffset instead of modifying z coord in geom? or store as separate field that doesn't affect y coord in vertex shader
    var z = (feature.properties && feature.properties.sort_key) || layer.number;
    z /= 100;

    var color = (style.color && (style.color[feature.properties.kind] || style.color.default)) || [1.0, 0, 0];
    if (typeof color == 'function') { // dynamic/function-based color
        color = color(feature);
    }

    var height, wall_vertices;

    var num_polygons = polygons.length;
    for (var p=0; p < num_polygons; p++) {
        var polygon = polygons[p];

        // Polygon outlines & edge detection - experimental
        // for (t=0; t < polygon.length; t++) {
        //     for (p=0; p < polygon[t].length - 1; p++) {
        //         // Point A to B
        //         var pa = polygon[t][p];
        //         var pb = polygon[t][p+1];

        //         // Edge detection
        //         var edge = null;
        //         var pointTest = GLRenderer.aboutEqual;
        //         var tol = 2;

        //         if (pointTest(pa[0], tile.min.x, tol) && pointTest(pb[0], tile.min.x, tol)) {
        //             edge = 'left';
        //         }
        //         else if (pointTest(pa[0], tile.max.x, tol) && pointTest(pb[0], tile.max.x, tol)) {
        //             edge = 'right';
        //         }
        //         else if (pointTest(pa[1], tile.min.y, tol) && pointTest(pb[1], tile.min.y, tol)) {
        //             edge = 'top';
        //         }
        //         else if (pointTest(pa[1], tile.max.y, tol) && pointTest(pb[1], tile.max.y, tol)) {
        //             edge = 'bottom';
        //         }

        //         if (edge != null) {
        //             console.log("tile " + tile.key + " edge detected: " + edge);
        //             continue;
        //         }

        //         lines.push(
        //             // Point A
        //             pa[0],
        //             pa[1],
        //             z + 0,
        //             0, 0, 1, // flat surfaces point straight up
        //             1, 1, 1, // white
        //             // Point B
        //             pb[0],
        //             pb[1],
        //             z + 0,
        //             0, 0, 1, // flat surfaces point straight up
        //             1, 1, 1 // white
        //         );
        //     }
        // }

        // Use libtess.js port of gluTesselator for complex OSM polygons
        var vertices = GL.triangulate(polygon);

        // 3D buildings
        // TODO: try moving this into a style-specific post-processing/filter function?
        height = (feature.properties && feature.properties.height) || 20;
        if (layer.name == 'buildings' &&
            ((tile.coords.z >= 15 && height > 20) || tile.coords.z >= 16)) {

            for (var t=0; t < vertices.length; t++) {
                vertex_data.push(
                    vertices[t][0],
                    vertices[t][1],
                    z + height,
                    0, 0, 1, // flat surfaces point straight up
                    color[0], color[1], color[2]
                );
            }

            for (var q=0; q < polygon.length; q++) {
                var contour = polygon[q];

                for (var w=0; w < contour.length - 1; w++) {
                    wall_vertices = [];

                    // Two triangles for the quad formed by each vertex pair, going from ground to building height
                    wall_vertices.push(
                        // Triangle
                        [contour[w+1][0], contour[w+1][1], z + height],
                        [contour[w+1][0], contour[w+1][1], z],
                        [contour[w][0], contour[w][1], z],
                        // Triangle
                        [contour[w][0], contour[w][1], z],
                        [contour[w][0], contour[w][1], z + height],
                        [contour[w+1][0], contour[w+1][1], z + height]
                    );

                    // Calc the normal of the wall from up vector and one segment of the wall triangles
                    var normal = Vector.cross(
                        [0, 0, 1],
                        Vector.normalize([contour[w+1][0] - contour[w][0], contour[w+1][1] - contour[w][1], 0])
                    );

                    for (var t=0; t < wall_vertices.length; t++) {
                        vertex_data.push(
                            wall_vertices[t][0],
                            wall_vertices[t][1],
                            wall_vertices[t][2],
                            normal[0], normal[1], normal[2],
                            color[0], color[1], color[2]
                        );
                    }
                }
            }
        }
        // Regular polygon
        else {
            for (var t=0; t < vertices.length; t++) {
                vertex_data.push(
                    vertices[t][0],
                    vertices[t][1],
                    z,
                    0, 0, 1, // flat surfaces point straight up
                    color[0], color[1], color[2]
                );
            }
        }
    }

    return vertex_data;
};

// Build tessellated triangles for a polyline
GL.buildPolylines = function buildPolylines (lines, feature, layer, style, tile, vertex_data, vertex_lines)
{
    // To ensure layers draw in order, offset z coordinate by one centimeter per layer
    // TODO: use glPolygonOffset instead of modifying z coord in geom? or store as separate field that doesn't affect y coord in vertex shader
    var z = (feature.properties && feature.properties.sort_key) || layer.number;
    z /= 100;

    var color = (style.color && (style.color[feature.properties.kind] || style.color.default)) || [1.0, 0, 0];
    if (typeof color == 'function') {
        color = color(feature);
    }

    var width = (style.width && (style.width[feature.properties.kind] || style.width.default)) || 1;
    if (typeof width == 'function') {
        width = width(feature, tile);
    }

    // Line center - debugging
    // if (GLRenderer.debug) {
    //     var num_lines = lines.length;
    //     for (var ln=0; ln < num_lines; ln++) {
    //         var line = lines[ln];

    //         for (var p=0; p < line.length - 1; p++) {
    //             // Point A to B
    //             var pa = line[p];
    //             var pb = line[p+1];

    //             vertex_lines.push(
    //                 pa[0], pa[1], z + 0.001,
    //                 0, 0, 1, 1.0, 0, 0,
    //                 pb[0], pb[1], z + 0.001,
    //                 0, 0, 1, 1.0, 0, 0
    //             );
    //         }
    //     };
    // }

    // Build triangles
    var vertices = [];
    var num_lines = lines.length;
    for (var ln=0; ln < num_lines; ln++) {
        var line = lines[ln];
        // Multiple line segments
        if (line.length > 3) {
            // Find midpoints
            var mid = [];
            mid.push(line[0]); // use line start instead of first midpoint
            if (line.length > 3) {
                for (var p=1; p < line.length - 2; p++) {
                    var pa = line[p];
                    var pb = line[p+1];
                    mid.push([(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2]);
                }
            }
            mid.push(line[line.length-1]); // use line end instead of last midpoint

            // Make anchors (3-point segments connecting line joints and midpoints)
            var anchors = [];
            for (var p=0; p < mid.length - 1; p++)  {
                anchors.push([mid[p], line[p+1], mid[p+1]]);
            }

            for (var p=0; p < anchors.length; p++) {
                buildAnchor(anchors[p][0], anchors[p][1], anchors[p][2]);
                // buildSegment(anchors[p][0], anchors[p][1]); // use these to draw extruded segments w/o join, for debugging
                // buildSegment(anchors[p][1], anchors[p][2]);
            }
        }
        // Single 3-point anchor
        else if (line.length == 3) {
            buildAnchor(line[0], line[1], line[2]);
        }
        // Single 2-point segment
        else if (line.length == 2) {
            buildSegment(line[0], line[1]);
        }
    };

    // Add normals and colors
    for (var v=0; v < vertices.length; v++) {
        var vertex = vertices[v];
        vertex_data.push(
            vertex[0], vertex[1], z,
            0, 0, 1, // flat surfaces point straight up
            color[0], color[1], color[2]
        );
    }

    // Build triangles for a single line segment, extruded by the provided width
    function buildSegment (pa, pb) {
        var slope = Vector.normalize([(pb[1] - pa[1]) * -1, pb[0] - pa[0], 0]);

        var pa_outer = [pa[0] + slope[0] * width/2, pa[1] + slope[1] * width/2, 0];
        var pa_inner = [pa[0] - slope[0] * width/2, pa[1] - slope[1] * width/2, 0];

        var pb_outer = [pb[0] + slope[0] * width/2, pb[1] + slope[1] * width/2, 0];
        var pb_inner = [pb[0] - slope[0] * width/2, pb[1] - slope[1] * width/2, 0];

        vertices.push(
            pb_inner, pb_outer, pa_inner,
            pa_inner, pb_outer, pa_outer
        );
    }

    // Build triangles for a 3-point 'anchor' shape, consisting of two line segments with a joint
    // TODO: move these functions out of closures?
    function buildAnchor (pa, joint, pb) {
        // Inner and outer line segments for [pa, joint] and [joint, pb]
        var pa_slope = Vector.normalize([(joint[1] - pa[1]) * -1, joint[0] - pa[0], 0]);
        var pa_outer = [
            [pa[0] + pa_slope[0] * width/2, pa[1] + pa_slope[1] * width/2, 0],
            [joint[0] + pa_slope[0] * width/2, joint[1] + pa_slope[1] * width/2, 0]
        ];
        var pa_inner = [
            [pa[0] - pa_slope[0] * width/2, pa[1] - pa_slope[1] * width/2, 0],
            [joint[0] - pa_slope[0] * width/2, joint[1] - pa_slope[1] * width/2, 0]
        ];

        var pb_slope = Vector.normalize([(pb[1] - joint[1]) * -1, pb[0] - joint[0], 0]);
        var pb_outer = [
            [joint[0] + pb_slope[0] * width/2, joint[1] + pb_slope[1] * width/2, 0],
            [pb[0] + pb_slope[0] * width/2, pb[1] + pb_slope[1] * width/2, 0]
        ];
        var pb_inner = [
            [joint[0] - pb_slope[0] * width/2, joint[1] - pb_slope[1] * width/2, 0],
            [pb[0] - pb_slope[0] * width/2, pb[1] - pb_slope[1] * width/2, 0]
        ];

        // Miter join
        // Solve for the intersection between the two outer line segments
        // http://en.wikipedia.org/wiki/Line-line_intersection
        // http://en.wikipedia.org/wiki/Cramer's_rule
        // a1*x + b1*y = c1 for line (x1, y1) to (x2, y2)
        // a2*x + b2*y = c2 for line (x3, y3) to (x4, y4)
        var a1 = pa_outer[0][1] - pa_outer[1][1]; // y1 - y2
        var b1 = pa_outer[0][0] - pa_outer[1][0]; // x1 - x2
        var a2 = pb_outer[0][1] - pb_outer[1][1]; // y3 - y4
        var b2 = pb_outer[0][0] - pb_outer[1][0]; // x3 - x4
        var c1 = (pa_outer[0][0] * pa_outer[1][1]) - (pa_outer[0][1] * pa_outer[1][0]); // x1*y2 - y1*x2
        var c2 = (pb_outer[0][0] * pb_outer[1][1]) - (pb_outer[0][1] * pb_outer[1][0]); // x3*y4 - y3*x4
        var denom = (b1 * a2) - (a1 * b2);

        // Find the intersection point
        var intersect_outer;
        var line_debug = null;
        if (denom > 0.01) {
            intersect_outer = [
                ((c1 * b2) - (b1 * c2)) / denom,
                ((c1 * a2) - (a1 * c2)) / denom
            ];

            // Cap the intersection point to a reasonable distance (as join angle becomes sharper, miter joint distance would approach infinity)
            var len_sq = Vector.lengthSq([intersect_outer[0] - joint[0], intersect_outer[1] - joint[1], 0]);
            var miter_len_max = 3; // multiplier on line width for max distance miter join can be from joint
            if (len_sq > (width * width * miter_len_max * miter_len_max)) {
                line_debug = 'distance';
                intersect_outer = Vector.normalize([intersect_outer[0] - joint[0], intersect_outer[1] - joint[1], 0]);
                intersect_outer = [
                    joint[0] + intersect_outer[0] * miter_len_max,
                    joint[1] + intersect_outer[1] * miter_len_max
                ]
            }
        }
        else {
            // Line segments are parallel, use the first outer line segment as join instead
            line_debug = 'parallel';
            intersect_outer = pa_outer[1];
        }

        var intersect_inner = [
            (joint[0] - intersect_outer[0]) + joint[0],
            (joint[1] - intersect_outer[1]) + joint[1]
        ];

        vertices.push(
            intersect_inner, intersect_outer, pa_inner[0],
            pa_inner[0], intersect_outer, pa_outer[0],

            pb_inner[1], pb_outer[1], intersect_inner,
            intersect_inner, pb_outer[1], intersect_outer
        );

        // Extruded segments, no intersection/joint - debugging
        // vertices.push(
        //     pa_inner[1], intersect_outer, pa_inner[0],
        //     pa_inner[0], intersect_outer, pa_outer[0],

        //     pb_inner[1], pb_outer[1], pb_inner[0],
        //     pb_inner[0], pb_outer[1], intersect_outer
        // );

        // Line outer edge - debugging
        // vertex_lines.push(
        //     pa_outer[0][0], pa_outer[0][1], z + 0.001,
        //     0, 0, 1, 0, 1.0, 0,
        //     pa_outer[1][0], pa_outer[1][1], z + 0.001,
        //     0, 0, 1, 0, 1.0, 0,
        //     pb_outer[0][0], pb_outer[0][1], z + 0.001,
        //     0, 0, 1, 0, 1.0, 0,
        //     pb_outer[1][0], pb_outer[1][1], z + 0.001,
        //     0, 0, 1, 0, 1.0, 0
        // );

        // if (GLRenderer.debug && line_debug) {
        if (debug && line_debug) {
            var dcolor;
            if (line_debug == 'parallel') {
                console.log("!!! lines are parallel !!!");
                dcolor = [0, 1, 0];
            }
            else if (line_debug == 'distance') {
                console.log("!!! miter intersection point exceeded allowed distance from joint !!!");
                dcolor = [1, 0, 0];
            }
            console.log('OSM id: ' + feature.id); // TODO: if this function is moved out of a closure, this feature debug info won't be available
            console.log([pa, joint, pb]);
            console.log(feature);
            vertex_lines.push(
                pa[0], pa[1], z + 0.002,
                0, 0, 1, dcolor[0], dcolor[1], dcolor[2],
                joint[0], joint[1], z + 0.002,
                0, 0, 1, dcolor[0], dcolor[1], dcolor[2],
                joint[0], joint[1], z + 0.002,
                0, 0, 1, dcolor[0], dcolor[1], dcolor[2],
                pb[0], pb[1], z + 0.002,
                0, 0, 1, dcolor[0], dcolor[1], dcolor[2]
            );

            var num_lines = lines.length;
            for (var ln=0; ln < num_lines; ln++) {
                var line2 = lines[ln];

                for (var p=0; p < line2.length - 1; p++) {
                    // Point A to B
                    var pa = line2[p];
                    var pb = line2[p+1];

                    vertex_lines.push(
                        pa[0], pa[1], z + 0.0005,
                        0, 0, 1, 0, 0, 1.0,
                        pb[0], pb[1], z + 0.0005,
                        0, 0, 1, 0, 0, 1.0
                    );
                }
            };
        }
    }

    return vertex_data;
};

// Build native GL lines for a polyline
GL.buildLines = function buildLines (lines, feature, layer, style, tile, vertex_data)
{
    // To ensure layers draw in order, offset z coordinate by one centimeter per layer
    // TODO: use glPolygonOffset instead of modifying z coord in geom? or store as separate field that doesn't affect y coord in vertex shader
    var z = (feature.properties && feature.properties.sort_key) || layer.number;
    z /= 100;

    var color = (style.color && (style.color[feature.properties.kind] || style.color.default)) || [1.0, 0, 0];
    if (typeof color == 'function') { // dynamic/function-based color
        color = color(feature);
    }

    var num_lines = lines.length;
    for (var ln=0; ln < num_lines; ln++) {
        var line = lines[ln];

        for (var p=0; p < line.length - 1; p++) {
            // Point A to B
            var pa = line[p];
            var pb = line[p+1];

            vertex_data.push(
                // Point A
                pa[0],
                pa[1],
                z + 0,
                0, 0, 1, // flat surfaces point straight up
                color[0], color[1], color[2],
                // Point B
                pb[0],
                pb[1],
                z + 0,
                0, 0, 1, // flat surfaces point straight up
                color[0], color[1], color[2]
            );
        }
    };

    return vertex_data;
};
