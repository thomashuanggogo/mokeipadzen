(function () {
    'use strict';

    var DEG = Math.PI / 180;
    var categories = [
        { id: 'general', name: '一般標註', label: '一般標註' },
        { id: 'mechanics', name: '力學', label: '力學' },
        { id: 'circuit', name: '電路', label: '電路' },
        { id: 'electromagnetism', name: '電磁場', label: '電磁場' },
        { id: 'waves', name: '波動與光學', label: '波動與光學' },
        { id: 'thermal', name: '熱學', label: '熱學' },
        { id: 'modern', name: '近代物理', label: '近代物理' },
        { id: 'graphs', name: '座標圖', label: '座標圖' }
    ];
    var assets = [];
    var definitions = Object.create(null);

    function number(value, fallback) {
        var parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function positive(value, fallback, minimum) {
        return Math.max(minimum || 1, Math.abs(number(value, fallback)));
    }

    function add(category, type, name, width, height, renderer, config) {
        var options = config || {};
        var definition = {
            type: type,
            id: type,
            category: category,
            name: name,
            label: name,
            width: width,
            height: height,
            defaultWidth: width,
            defaultHeight: height,
            draw: renderer,
            defaultLabel: options.defaultLabel || '',
            keywords: options.keywords || [],
            measure: options.measure || null,
            labelPosition: options.labelPosition || null,
            suppressCommonLabel: Boolean(options.suppressCommonLabel),
            modelNote: String(options.modelNote || ''),
            dataEditor: options.dataEditor || null,
            parametric: options.parametric || null
        };
        definitions[type] = definition;
        assets.push({
            type: type,
            id: type,
            category: category,
            name: name,
            label: name,
            width: width,
            height: height,
            defaultWidth: width,
            defaultHeight: height,
            defaultLabel: definition.defaultLabel,
            keywords: definition.keywords.slice()
        });
    }

    function addCategory(id, name, label) {
        var categoryId = String(id || '');
        if (!categoryId || categories.some(function (category) { return category.id === categoryId; })) return;
        categories.push({
            id: categoryId,
            name: String(name || label || categoryId),
            label: String(label || name || categoryId)
        });
    }

    function begin(ctx) {
        ctx.beginPath();
    }

    function path(ctx, points, close) {
        if (!points.length) return;
        begin(ctx);
        ctx.moveTo(points[0][0], points[0][1]);
        for (var i = 1; i < points.length; i += 1) {
            ctx.lineTo(points[i][0], points[i][1]);
        }
        if (close) ctx.closePath();
    }

    function strokePath(ctx, points, close) {
        path(ctx, points, close);
        ctx.stroke();
    }

    function circle(ctx, x, y, radius, fill) {
        begin(ctx);
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        if (fill) ctx.fill();
        ctx.stroke();
    }

    function dot(ctx, x, y, radius) {
        ctx.save();
        ctx.fillStyle = ctx.strokeStyle;
        begin(ctx);
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    function write(ctx, value, x, y, item, size, align) {
        if (value === undefined || value === null || String(value) === '') return;
        var flipX = item && item.flippedX ? -1 : 1;
        var flipY = item && item.flippedY ? -1 : 1;
        ctx.save();
        ctx.fillStyle = ctx.strokeStyle;
        ctx.scale(flipX, flipY);
        ctx.font = String(size || 18) + 'px "Times New Roman", "Noto Sans TC", serif';
        ctx.textAlign = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(value), x * flipX, y * flipY);
        ctx.restore();
    }

    function arrow(ctx, x1, y1, x2, y2, headSize, atStart) {
        var angle = Math.atan2(y2 - y1, x2 - x1);
        var size = headSize || 10;
        begin(ctx);
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        function head(x, y, direction) {
            ctx.save();
            ctx.fillStyle = ctx.strokeStyle;
            begin(ctx);
            ctx.moveTo(x, y);
            ctx.lineTo(
                x - size * Math.cos(direction - Math.PI / 6),
                y - size * Math.sin(direction - Math.PI / 6)
            );
            ctx.lineTo(
                x - size * Math.cos(direction + Math.PI / 6),
                y - size * Math.sin(direction + Math.PI / 6)
            );
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
        head(x2, y2, angle);
        if (atStart) head(x1, y1, angle + Math.PI);
    }

    function hatchLine(ctx, x1, y1, x2, y2, spacing, length) {
        var dx = x2 - x1;
        var dy = y2 - y1;
        var total = Math.sqrt(dx * dx + dy * dy) || 1;
        var tx = dx / total;
        var ty = dy / total;
        var nx = -dy / total;
        var ny = dx / total;
        var hatchLength = Math.abs(length);
        var normalDirection = length < 0 ? -1 : 1;
        var tangentShift = hatchLength * 0.58;
        var count = Math.max(1, Math.floor(total / spacing));
        for (var i = 0; i <= count; i += 1) {
            var t = i / count;
            var x = x1 + dx * t;
            var y = y1 + dy * t;
            strokePath(ctx, [[x, y], [
                x + nx * hatchLength * normalDirection + tx * tangentShift,
                y + ny * hatchLength * normalDirection + ty * tangentShift
            ]]);
        }
    }

    function terminals(ctx, halfWidth, leftEnd, rightStart) {
        strokePath(ctx, [[-halfWidth, 0], [leftEnd, 0]]);
        strokePath(ctx, [[rightStart, 0], [halfWidth, 0]]);
    }

    function zigzagResistor(ctx, left, right, amplitude, segmentCount) {
        var points = [[left, 0]];
        var segments = segmentCount || 8;
        for (var i = 1; i < segments; i += 1) {
            points.push([
                left + (right - left) * i / segments,
                i % 2 === 1 ? -amplitude : amplitude
            ]);
        }
        points.push([right, 0]);
        strokePath(ctx, points);
    }

    function drawAxes(ctx, width, height, xLabel, yLabel, item) {
        var left = -width / 2 + 12;
        var right = width / 2 - 8;
        var top = -height / 2 + 8;
        var bottom = height / 2 - 14;
        arrow(ctx, left, bottom, right, bottom, 7, false);
        arrow(ctx, left, bottom, left, top, 7, false);
        write(ctx, xLabel || 't', right - 2, bottom + 12, item, 14);
        write(ctx, yLabel || 'y', left - 12, top + 3, item, 14);
        return { left: left, right: right, top: top, bottom: bottom };
    }

    function drawSignedTimeAxes(ctx, width, height, yLabel, item) {
        var left = -width / 2 + 12;
        var right = width / 2 - 8;
        var top = -height / 2 + 8;
        var bottom = height / 2 - 14;
        var zero = (top + bottom) / 2;
        arrow(ctx, left, zero, right, zero, 7, false);
        arrow(ctx, left, bottom, left, top, 7, false);
        write(ctx, 't', right - 2, zero + 13, item, 14);
        write(ctx, yLabel, left - 12, top + 3, item, 14);
        write(ctx, '0', left - 10, zero + 12, item, 11);
        return { left: left, right: right, top: top, bottom: bottom, zero: zero };
    }

    function lineMeasure(item) {
        return { width: positive(item && item.length, 120, 12), height: 20 };
    }

    function wireMeasure(item) {
        return { width: positive(item && item.length, 120, 0.01), height: 20 };
    }

    function arrowMeasure(item) {
        return { width: positive(item && item.length, 110, 20), height: 44 };
    }

    function annotationTextWidth(value, fontSize, minimum) {
        var textValue = String(value || '');
        var units = 0;
        for (var character of textValue) {
            if (/\s/.test(character)) units += 0.35;
            else if (character.charCodeAt(0) <= 0x7f) units += 0.62;
            else units += 1;
        }
        return Math.max(minimum, units * fontSize + 20);
    }

    function textMeasure(item) {
        return { width: annotationTextWidth(item && item.label, 22, 54), height: 36 };
    }

    function labelMeasure(item) {
        return { width: annotationTextWidth(item && item.label, 18, 64), height: 38 };
    }

    function graphMeasure(item, definition) {
        return {
            width: positive(item && item.width, definition.width, 80),
            height: positive(item && item.height, definition.height, 60)
        };
    }

    function waveMeasure(item, definition) {
        return {
            width: positive(item && (item.length || item.width), definition.width, 40),
            height: positive(item && item.height, definition.height, 24)
        };
    }

    function clampNumber(value, minimum, maximum, fallback) {
        return Math.max(minimum, Math.min(maximum, number(value, fallback)));
    }

    function oneDecimal(value) {
        return Math.round(number(value, 0) * 10) / 10;
    }

    function distanceToSegment(point, start, end) {
        var dx = end.x - start.x;
        var dy = end.y - start.y;
        var denominator = dx * dx + dy * dy;
        var ratio = denominator > 0
            ? ((point.x - start.x) * dx + (point.y - start.y) * dy) / denominator
            : 0;
        ratio = Math.max(0, Math.min(1, ratio));
        var nearestX = start.x + dx * ratio;
        var nearestY = start.y + dy * ratio;
        return Math.hypot(point.x - nearestX, point.y - nearestY);
    }

    function normalizeDegrees(value) {
        return ((number(value, 0) + 180) % 360 + 360) % 360 - 180;
    }

    function snapSemanticAngle(value, options, minimum, maximum) {
        var angle = normalizeDegrees(value);
        var settings = options || {};
        if (!settings.altKey) {
            if (settings.shiftKey) {
                angle = Math.round(angle / 15) * 15;
            } else if (settings.snap) {
                var nearest = Math.round(angle / 5) * 5;
                if (Math.abs(angle - nearest) <= 2) angle = nearest;
            }
        }
        return clampNumber(angle, minimum, maximum, angle);
    }

    function paramsFor(item, type) {
        var params = getDefaultParams(type, item && item.params);
        if (item) item.params = params;
        return params;
    }

    function parameter(key, label, minimum, maximum, step, unit) {
        return {
            key: key,
            label: label,
            min: minimum,
            max: maximum,
            step: step || 1,
            unit: unit || ''
        };
    }

    function sanitizedByControls(defaults, controls, source) {
        var incoming = source && typeof source === 'object' ? source : {};
        var output = {};
        controls.forEach(function (control) {
            var fallback = defaults[control.key];
            var value = clampNumber(incoming[control.key], control.min, control.max, fallback);
            // Keep the precision advertised by the control; 0.05 must not become 0.1.
            var step = positive(control.step, 1, 0.000001);
            var snapped = control.min + Math.round((value - control.min) / step) * step;
            output[control.key] = Number(clampNumber(snapped, control.min, control.max, fallback).toFixed(8));
        });
        Object.keys(defaults).forEach(function (key) {
            if (!Object.prototype.hasOwnProperty.call(output, key)) output[key] = defaults[key];
        });
        return output;
    }

    function makeParametric(defaults, controls, methods) {
        var config = methods || {};
        config.defaults = defaults;
        config.controls = controls;
        if (!config.sanitize) {
            config.sanitize = function (params) {
                return sanitizedByControls(defaults, controls, params);
            };
        }
        return config;
    }

    var PENDULUM_PIVOT_Y = -58;

    function pendulumState(item) {
        var params = paramsFor(item, 'pendulum');
        var radians = params.angle * DEG;
        return {
            params: params,
            pivot: { x: 0, y: PENDULUM_PIVOT_Y },
            bob: {
                x: Math.sin(radians) * params.length,
                y: PENDULUM_PIVOT_Y + Math.cos(radians) * params.length
            }
        };
    }

    var pendulumParametric = {
        defaults: { length: 112, angle: 15, bobRadius: 13, lockLength: 0 },
        controls: [
            parameter('length', '擺長', 50, 360, 1, 'px'),
            parameter('angle', '擺角', -85, 85, 1, '°'),
            parameter('bobRadius', '擺錘大小', 7, 36, 1, 'px')
        ],
        sanitize: function (params) {
            return {
                length: oneDecimal(clampNumber(params.length, 50, 360, 112)),
                angle: oneDecimal(clampNumber(params.angle, -85, 85, 15)),
                bobRadius: oneDecimal(clampNumber(params.bobRadius, 7, 36, 13)),
                lockLength: number(params.lockLength, 0) ? 1 : 0
            };
        },
        bounds: function (item) {
            var state = pendulumState(item);
            var radius = state.params.bobRadius;
            return {
                left: Math.min(-36, state.bob.x - radius),
                top: Math.min(PENDULUM_PIVOT_Y - 14, state.bob.y - radius),
                right: Math.max(36, state.bob.x + radius),
                bottom: Math.max(PENDULUM_PIVOT_Y + 10, state.bob.y + radius)
            };
        },
        handles: function (item) {
            var state = pendulumState(item);
            return [{
                id: 'bob',
                label: '擺錘',
                x: state.bob.x,
                y: state.bob.y,
                primary: true,
                readout: 'L ' + Math.round(state.params.length) + ' px · θ ' + Math.round(state.params.angle) + '°'
            }];
        },
        hitTest: function (item, point, padding) {
            var state = pendulumState(item);
            var bobDistance = Math.hypot(point.x - state.bob.x, point.y - state.bob.y);
            return bobDistance <= state.params.bobRadius + padding
                || distanceToSegment(point, state.pivot, state.bob) <= padding + 3
                || distanceToSegment(
                    point,
                    { x: -34, y: state.pivot.y },
                    { x: 34, y: state.pivot.y }
                ) <= padding + 4;
        },
        update: function (item, handleId, localPoint, options) {
            if (handleId !== 'bob') return null;
            var dx = localPoint.x;
            var dy = localPoint.y - PENDULUM_PIVOT_Y;
            var params = paramsFor(item, 'pendulum');
            if (!params.lockLength) params.length = clampNumber(Math.sqrt(dx * dx + dy * dy), 50, 360, params.length);
            params.angle = snapSemanticAngle(Math.atan2(dx, dy) / DEG, options, -85, 85);
            item.params = pendulumParametric.sanitize(params);
            return {
                readout: 'L ' + Math.round(item.params.length) + ' px · θ ' + Math.round(item.params.angle) + '°'
            };
        }
    };

    function leverState(item) {
        var params = paramsFor(item, 'lever');
        var radians = params.angle * DEG;
        var direction = { x: Math.cos(radians), y: Math.sin(radians) };
        return {
            params: params,
            direction: direction,
            left: { x: -direction.x * params.leftArm, y: -direction.y * params.leftArm },
            right: { x: direction.x * params.rightArm, y: direction.y * params.rightArm }
        };
    }

    function leverReadout(params) {
        var ratio = params.rightArm > 0 ? params.leftArm / params.rightArm : 0;
        return 'L₁ ' + Math.round(params.leftArm) + ' · L₂ ' + Math.round(params.rightArm)
            + ' · ' + ratio.toFixed(2) + ':1';
    }

    var leverParametric = {
        defaults: { leftArm: 75, rightArm: 75, angle: 8, lockAngle: 0 },
        controls: [
            parameter('leftArm', '左桿長', 30, 360, 1, 'px'),
            parameter('rightArm', '右桿長', 30, 360, 1, 'px'),
            parameter('angle', '桿件角度', -80, 80, 1, '°')
        ],
        sanitize: function (params) {
            return {
                leftArm: oneDecimal(clampNumber(params.leftArm, 30, 360, 75)),
                rightArm: oneDecimal(clampNumber(params.rightArm, 30, 360, 75)),
                angle: oneDecimal(clampNumber(params.angle, -80, 80, 8)),
                lockAngle: Number(params.lockAngle) === 1 ? 1 : 0
            };
        },
        bounds: function (item) {
            var state = leverState(item);
            return {
                left: Math.min(state.left.x, state.right.x, -20) - 8,
                top: Math.min(state.left.y, state.right.y, 0) - 8,
                right: Math.max(state.left.x, state.right.x, 20) + 8,
                bottom: Math.max(state.left.y, state.right.y, 32) + 5
            };
        },
        handles: function (item) {
            var state = leverState(item);
            var readout = leverReadout(state.params);
            return [
                { id: 'left-end', label: '左端', x: state.left.x, y: state.left.y, readout: readout },
                { id: 'pivot', label: '支點', x: 0, y: 0, primary: true, readout: readout },
                { id: 'right-end', label: '右端', x: state.right.x, y: state.right.y, readout: readout }
            ];
        },
        hitTest: function (item, point, padding) {
            var state = leverState(item);
            var insideSupport = point.y >= -padding && point.y <= 30 + padding
                && Math.abs(point.x) <= 18 * Math.max(0, point.y) / 30 + padding;
            return insideSupport || distanceToSegment(point, state.left, state.right) <= padding + 4;
        },
        update: function (item, handleId, localPoint, options) {
            var params = paramsFor(item, 'lever');
            var direction = { x: Math.cos(params.angle * DEG), y: Math.sin(params.angle * DEG) };
            if (handleId === 'left-end') {
                params.leftArm = clampNumber(params.lockAngle ? -(localPoint.x * direction.x + localPoint.y * direction.y) : Math.hypot(localPoint.x, localPoint.y), 30, 360, params.leftArm);
                if (!params.lockAngle) params.angle = snapSemanticAngle(Math.atan2(-localPoint.y, -localPoint.x) / DEG, options, -80, 80);
            } else if (handleId === 'right-end') {
                params.rightArm = clampNumber(params.lockAngle ? localPoint.x * direction.x + localPoint.y * direction.y : Math.hypot(localPoint.x, localPoint.y), 30, 360, params.rightArm);
                if (!params.lockAngle) params.angle = snapSemanticAngle(Math.atan2(localPoint.y, localPoint.x) / DEG, options, -80, 80);
            } else if (handleId === 'pivot') {
                var radians = params.angle * DEG;
                var direction = { x: Math.cos(radians), y: Math.sin(radians) };
                var projection = localPoint.x * direction.x + localPoint.y * direction.y;
                var shift = clampNumber(projection, -(params.leftArm - 30), params.rightArm - 30, 0);
                params.leftArm += shift;
                params.rightArm -= shift;
                item.params = leverParametric.sanitize(params);
                return {
                    originShift: { x: direction.x * shift, y: direction.y * shift },
                    readout: leverReadout(item.params)
                };
            } else {
                return null;
            }
            item.params = leverParametric.sanitize(params);
            return { readout: leverReadout(item.params) };
        }
    };

    function projectileState(item) {
        var params = paramsFor(item, 'projectilePath');
        var radians = (params.launchMode === 2 ? 90 : params.launchMode === 1 ? 0 : params.angle) * DEG;
        var tangent = -Math.tan(radians);
        var verticalControl = params.launchMode === 2 ? -Math.sqrt(params.range) * (Math.sqrt(params.range) + Math.sqrt(params.range + params.drop)) : 0;
        return {
            params: params,
            tangent: tangent,
            control: { x: params.launchMode === 2 ? 0 : params.direction * params.range / 2, y: params.launchMode === 2 ? verticalControl : tangent * params.range / 2 },
            landing: { x: params.launchMode === 2 ? 0 : params.direction * params.range, y: params.drop },
            velocityTip: {
                x: params.direction * Math.cos(radians) * params.velocityLength,
                y: -Math.sin(radians) * params.velocityLength
            }
        };
    }

    function projectileReadout(params) {
        var verticalDisplacement = -params.drop;
        var dropPrefix = verticalDisplacement > 0 ? '+' : '';
        return (params.launchMode === 2 ? '鉛直 · H ' : params.launchMode === 1 ? '水平 · R ' : 'θ ' + Math.round(params.angle) + '° · R ') + Math.round(params.range)
            + ' px · Δy ' + dropPrefix + Math.round(verticalDisplacement) + ' px';
    }

    var projectileParametric = {
        defaults: { angle: 42, range: 180, drop: 0, velocityLength: 52, launchMode: 0, direction: 1, showVelocity: 1 },
        controls: [
            { key: 'launchMode', label: '拋射方式', min: 0, max: 2, step: 1, kind: 'select', choices: [{ value: 0, label: '斜拋' }, { value: 1, label: '水平拋射' }, { value: 2, label: '鉛直上拋' }] },
            { key: 'direction', label: '拋射方向', min: -1, max: 1, step: 1, kind: 'select', choices: [{ value: 1, label: '向右' }, { value: -1, label: '向左' }] },
            { key: 'showVelocity', label: '初速度箭頭', min: 0, max: 1, step: 1, kind: 'select', choices: [{ value: 1, label: '顯示' }, { value: 0, label: '隱藏（題目）' }] },
            parameter('angle', '初射角', 5, 80, 1, '°'),
            parameter('range', '水平射程', 60, 700, 1, 'px'),
            parameter('drop', '畫布向下高差', -250, 350, 1, 'px'),
            parameter('velocityLength', '初速度箭頭長度（示意）', 28, 120, 1, 'px')
        ],
        getControls: function (item) { var p = paramsFor(item, 'projectilePath'); return projectileParametric.controls.filter(function (c) { return (c.key !== 'direction' || p.launchMode !== 2) && (c.key !== 'angle' || p.launchMode === 0) && (c.key !== 'velocityLength' || p.showVelocity); }); },
        sanitize: function (params) {
            var launchMode = Math.round(clampNumber(params.launchMode, 0, 2, 0));
            var angle = clampNumber(params.angle, 5, 80, 42);
            var range = clampNumber(params.range, 60, 700, 180);
            var tangent = -Math.tan(angle * DEG);
            var minimumDrop = launchMode === 1 ? 1 : launchMode === 2 ? Math.max(-250, -range + 1) : Math.max(-250, tangent * range + 1);
            return {
                launchMode: launchMode,
                direction: params.direction === -1 ? -1 : 1,
                showVelocity: params.showVelocity === 0 ? 0 : 1,
                angle: oneDecimal(angle),
                range: oneDecimal(range),
                drop: oneDecimal(clampNumber(params.drop, minimumDrop, 350, 0)),
                velocityLength: oneDecimal(clampNumber(params.velocityLength, 28, 120, 52))
            };
        },
        bounds: function (item) {
            var state = projectileState(item);
            var left = Math.min(0, state.velocityTip.x);
            var right = Math.max(0, state.landing.x, state.velocityTip.x);
            var top = Math.min(state.params.launchMode === 2 ? -state.params.range : 0, state.velocityTip.y);
            var bottom = Math.max(0, state.velocityTip.y, state.landing.y);
            for (var index = 0; index <= 32; index += 1) {
                var t = index / 32;
                var inverse = 1 - t;
                var x = inverse * inverse * 0 + 2 * inverse * t * state.control.x + t * t * state.landing.x;
                var y = 2 * inverse * t * state.control.y + t * t * state.landing.y;
                left = Math.min(left, x);
                right = Math.max(right, x);
                top = Math.min(top, y);
                bottom = Math.max(bottom, y);
            }
            return { left: left - 10, top: top - 12, right: right + 10, bottom: bottom + 12 };
        },
        handles: function (item) {
            var state = projectileState(item);
            var readout = projectileReadout(state.params);
            var handles = [
                {
                    id: 'velocity', label: '初速度方向／箭長',
                    x: state.velocityTip.x, y: state.velocityTip.y,
                    primary: true, readout: readout
                },
                { id: 'landing', label: '落點', x: state.landing.x, y: state.landing.y, readout: readout }
            ];
            if (!state.params.showVelocity) handles.shift();
            if (state.params.launchMode === 2) handles.push({ id: 'apex', label: '最高點', x: 0, y: -state.params.range, readout: readout });
            return handles;
        },
        hitTest: function (item, point, padding) {
            var state = projectileState(item);
            if (state.params.showVelocity && distanceToSegment(point, { x: 0, y: 0 }, state.velocityTip) <= padding + 4) return true;
            var previous = { x: 0, y: 0 };
            for (var index = 1; index <= 28; index += 1) {
                var t = index / 28;
                var inverse = 1 - t;
                var current = {
                    x: 2 * inverse * t * state.control.x + t * t * state.landing.x,
                    y: 2 * inverse * t * state.control.y + t * t * state.landing.y
                };
                if (distanceToSegment(point, previous, current) <= padding + 4) return true;
                previous = current;
            }
            return false;
        },
        update: function (item, handleId, localPoint, options) {
            var params = paramsFor(item, 'projectilePath');
            if (handleId === 'velocity') {
                if (!params.showVelocity) return null;
                if (params.launchMode === 0) params.angle = snapSemanticAngle(Math.atan2(-localPoint.y, params.direction * localPoint.x) / DEG, options, 5, 80);
                params.velocityLength = clampNumber(Math.hypot(localPoint.x, localPoint.y), 28, 120, params.velocityLength);
            } else if (handleId === 'landing') {
                if (params.launchMode !== 2) params.range = clampNumber(params.direction * localPoint.x, 60, 700, params.range);
                params.drop = clampNumber(localPoint.y, -250, 350, params.drop);
            } else if (handleId === 'apex' && params.launchMode === 2) {
                params.range = clampNumber(-localPoint.y, 60, 700, params.range);
            } else {
                return null;
            }
            item.params = projectileParametric.sanitize(params);
            return { readout: projectileReadout(item.params) };
        }
    };

    function angleArcState(item) {
        var params = paramsFor(item, 'angleArc');
        var radians = -params.angle * DEG;
        return {
            params: params,
            end: { x: params.radius * Math.cos(radians), y: params.radius * Math.sin(radians) }
        };
    }

    var angleArcParametric = makeParametric(
        { angle: 55, radius: 40 },
        [
            parameter('angle', '夾角', -350, 350, 1, '°'),
            parameter('radius', '半徑', 24, 180, 1, 'px')
        ],
        {
            bounds: function (item) {
                var state = angleArcState(item);
                return simpleBounds(state.params.radius * 2 + 42, state.params.radius * 2 + 42, 0);
            },
            handles: function (item) {
                var state = angleArcState(item);
                return [
                    {
                        id: 'angle', label: '角度', x: state.end.x, y: state.end.y, primary: true,
                        readout: 'θ ' + Math.round(state.params.angle) + '°'
                    },
                    {
                        id: 'radius', label: '半徑', x: state.params.radius, y: 0,
                        readout: 'r ' + Math.round(state.params.radius) + ' px'
                    }
                ];
            },
            hitTest: function (item, point, padding) {
                var state = angleArcState(item);
                return distanceToSegment(point, { x: 0, y: 0 }, { x: state.params.radius, y: 0 }) <= padding + 3
                    || distanceToSegment(point, { x: 0, y: 0 }, state.end) <= padding + 3
                    || Math.abs(Math.hypot(point.x, point.y) - state.params.radius * 0.64) <= padding + 5;
            },
            update: function (item, handleId, localPoint, options) {
                var params = paramsFor(item, 'angleArc');
                if (handleId === 'angle') {
                    var principalAngle = -Math.atan2(localPoint.y, localPoint.x) / DEG;
                    var unwrappedAngle = params.angle + normalizeDegrees(principalAngle - params.angle);
                    var settings = options || {};
                    if (!settings.altKey && settings.shiftKey) unwrappedAngle = Math.round(unwrappedAngle / 15) * 15;
                    else if (!settings.altKey && settings.snap) {
                        var nearby = Math.round(unwrappedAngle / 5) * 5;
                        if (Math.abs(nearby - unwrappedAngle) <= 2) unwrappedAngle = nearby;
                    }
                    params.angle = clampNumber(unwrappedAngle, -350, 350, params.angle);
                    params.radius = clampNumber(Math.hypot(localPoint.x, localPoint.y), 24, 180, params.radius);
                } else if (handleId === 'radius') {
                    params.radius = clampNumber(Math.abs(localPoint.x), 24, 180, params.radius);
                } else return null;
                item.params = angleArcParametric.sanitize(params);
                return { readout: 'θ ' + Math.round(item.params.angle) + '° · r ' + Math.round(item.params.radius) + ' px' };
            }
        }
    );

    function rampState(item) {
        var params = paramsFor(item, 'ramp');
        return {
            params: params,
            left: { x: -params.run / 2, y: params.rise / 2 },
            right: { x: params.run / 2, y: params.rise / 2 },
            top: { x: params.run / 2, y: -params.rise / 2 }
        };
    }

    var rampParametric = makeParametric(
        { run: 150, rise: 74, angle: null },
        [parameter('run', '底長（保持斜角）', 60, 600, 1, 'px'), parameter('angle', '斜面角度', 2, 85, 0.1, '°')],
        {
            sanitize: function (source) {
                var p = source || {}; var run = clampNumber(p.run, 60, 600, 150);
                var oldAngle = Math.atan2(clampNumber(p.rise, 5, 7000, 74), run) / DEG;
                var angle = p.angle === null || p.angle === undefined ? oldAngle : clampNumber(p.angle, 2, 85, oldAngle);
                angle = clampNumber(angle, 2, 85, oldAngle);
                return { run: run, angle: angle, rise: run * Math.tan(angle * DEG) };
            },
            bounds: function (item) {
                var state = rampState(item);
                return { left: state.left.x - 12, top: state.top.y - 10, right: state.right.x + 10, bottom: state.right.y + 14 };
            },
            handles: function (item) {
                var state = rampState(item);
                var angle = Math.atan2(state.params.rise, state.params.run) / DEG;
                var readout = 'θ ' + Math.round(angle) + '° · ' + Math.round(state.params.run) + ' × ' + Math.round(state.params.rise) + ' px';
                return [
                    { id: 'slope', label: '斜率', x: state.top.x, y: state.top.y, primary: true, readout: readout },
                    { id: 'base', label: '底長', x: state.left.x, y: state.left.y, readout: readout }
                ];
            },
            hitTest: function (item, point, padding) {
                var state = rampState(item);
                var slopeY = state.left.y - (point.x - state.left.x) * state.params.rise / state.params.run;
                var edgePadding = padding * Math.hypot(state.params.run, state.params.rise) / state.params.run;
                return point.x >= state.left.x - padding && point.x <= state.right.x + padding
                    && point.y >= state.top.y - padding && point.y <= state.right.y + padding
                    && point.y >= slopeY - edgePadding;
            },
            update: function (item, handleId, localPoint) {
                var params = paramsFor(item, 'ramp');
                if (handleId === 'slope') {
                    params.run = clampNumber(Math.abs(localPoint.x) * 2, 60, 600, params.run);
                    params.angle = Math.atan2(Math.abs(localPoint.y) * 2, params.run) / DEG;
                } else if (handleId === 'base') {
                    params.run = clampNumber(Math.abs(localPoint.x) * 2, 60, 600, params.run);
                } else return null;
                item.params = rampParametric.sanitize(params);
                return { readout: 'θ ' + Math.round(Math.atan2(item.params.rise, item.params.run) / DEG) + '°' };
            }
        }
    );

    function pulleyParametric(type, movable) {
        var controls = [
            parameter('radius', '滑輪半徑', 16, 72, 1, 'px'),
            parameter('leftRope', movable ? '左側上繩長' : '左側下繩長', 18, 240, 1, 'px'),
            parameter('rightRope', movable ? '右側上繩長' : '右側下繩長', 18, 240, 1, 'px')
        ];
        return makeParametric({ radius: 28, leftRope: 40, rightRope: 40 }, controls, {
            bounds: function (item) {
                var params = paramsFor(item, type);
                return {
                    left: -params.radius - 10,
                    top: movable ? -Math.max(params.radius, params.leftRope, params.rightRope) - 8 : -params.radius - 34,
                    right: params.radius + 10,
                    bottom: movable ? params.radius + 26 : params.radius + Math.max(params.leftRope, params.rightRope) + 8
                };
            },
            handles: function (item) {
                var params = paramsFor(item, type);
                var leftY = movable ? -params.leftRope : params.leftRope;
                var rightY = movable ? -params.rightRope : params.rightRope;
                var readout = 'r ' + Math.round(params.radius) + ' px';
                return [
                    { id: 'left-rope', label: '左繩端', x: -params.radius, y: leftY, readout: readout },
                    { id: 'right-rope', label: '右繩端', x: params.radius, y: rightY, readout: readout },
                    { id: 'radius', label: '輪緣', x: params.radius, y: 0, primary: true, readout: readout }
                ];
            },
            hitTest: function (item, point, padding) {
                var params = paramsFor(item, type);
                var ring = Math.abs(Math.hypot(point.x, point.y) - params.radius) <= padding + 5;
                var leftEnd = { x: -params.radius, y: movable ? -params.leftRope : params.leftRope };
                var rightEnd = { x: params.radius, y: movable ? -params.rightRope : params.rightRope };
                return ring
                    || distanceToSegment(point, { x: -params.radius, y: 0 }, leftEnd) <= padding + 3
                    || distanceToSegment(point, { x: params.radius, y: 0 }, rightEnd) <= padding + 3;
            },
            update: function (item, handleId, localPoint) {
                var params = paramsFor(item, type);
                if (handleId === 'radius') params.radius = clampNumber(Math.abs(localPoint.x), 16, 72, params.radius);
                else if (handleId === 'left-rope') params.leftRope = clampNumber(Math.abs(localPoint.y), 18, 240, params.leftRope);
                else if (handleId === 'right-rope') params.rightRope = clampNumber(Math.abs(localPoint.y), 18, 240, params.rightRope);
                else return null;
                item.params = definitions[type].parametric.sanitize(params);
                return { readout: 'r ' + Math.round(item.params.radius) + ' px' };
            }
        });
    }

    var fixedPulleyParametric = pulleyParametric('pulley', false);
    var movablePulleyParametric = pulleyParametric('movablePulley', true);

    var springParametric = makeParametric(
        { length: 130, amplitude: 13, coils: 10, startX: null },
        [
            parameter('length', '顯示長度（固定左端）', 50, 700, 1, 'px'),
            parameter('amplitude', '線圈半寬', 6, 40, 1, 'px'),
            parameter('coils', '鋸齒段數', 3, 24, 1, '段')
        ],
        {
            sanitize: function (source) {
                var p = sanitizedByControls(springParametric.defaults, springParametric.controls, source);
                p.startX = source.startX == null ? -p.length / 2 : number(source.startX, -p.length / 2);
                p.coils = Math.min(p.coils, Math.max(3, Math.floor((p.length - 28) / 6)));
                return p;
            },
            getControls: function (item) {
                var p = paramsFor(item, 'spring');
                return springParametric.controls.map(function (c) { return c.key === 'coils' ? Object.assign({}, c, { max: Math.min(24, Math.max(3, Math.floor((p.length - 28) / 6))) }) : c; });
            },
            bounds: function (item) {
                var params = paramsFor(item, 'spring');
                return { left: params.startX - 8, top: -params.amplitude - 28, right: params.startX + params.length + 8, bottom: params.amplitude + 9 };
            },
            handles: function (item) {
                var params = paramsFor(item, 'spring');
                return [
                    { id: 'start', label: '左端（右端固定）', x: params.startX, y: 0, readout: 'L ' + params.length + ' px' },
                    { id: 'end', label: '右端（左端固定）', x: params.startX + params.length, y: 0, primary: true, readout: 'L ' + params.length + ' px' },
                    { id: 'amplitude', label: '線圈半寬', x: params.startX + 14 + (params.length - 28) / params.coils, y: -params.amplitude, readout: '半寬 ' + params.amplitude + ' px' }
                ];
            },
            hitTest: function (item, point, padding) {
                var params = paramsFor(item, 'spring');
                return point.x >= params.startX - padding && point.x <= params.startX + params.length + padding
                    && Math.abs(point.y) <= params.amplitude + padding;
            },
            update: function (item, handleId, localPoint) {
                var params = paramsFor(item, 'spring');
                if (handleId === 'end') params.length = clampNumber(localPoint.x - params.startX, 50, 700, params.length);
                else if (handleId === 'start') {
                    var fixedRight = params.startX + params.length;
                    params.length = Math.round(clampNumber(fixedRight - localPoint.x, 50, 700, params.length));
                    params.startX = fixedRight - params.length;
                }
                else if (handleId === 'amplitude') params.amplitude = clampNumber(Math.abs(localPoint.y), 6, 40, params.amplitude);
                else return null;
                item.params = springParametric.sanitize(params);
                return { readout: 'L ' + item.params.length + ' px · ' + item.params.coils + ' 鋸齒段' };
            }
        }
    );

    var hangingMassParametric = makeParametric(
        { ropeLength: 58, massWidth: 48, massHeight: 50 },
        [
            parameter('ropeLength', '繩長', 20, 300, 1, 'px'),
            parameter('massWidth', '砝碼寬度', 24, 140, 1, 'px'),
            parameter('massHeight', '砝碼高度', 24, 160, 1, 'px')
        ],
        {
            bounds: function (item) {
                var params = paramsFor(item, 'hangingMass');
                return { left: -params.massWidth / 2 - 7, top: -params.ropeLength - 7, right: params.massWidth / 2 + 7, bottom: params.massHeight + 7 };
            },
            handles: function (item) {
                var params = paramsFor(item, 'hangingMass');
                return [
                    { id: 'rope', label: '繩端', x: 0, y: -params.ropeLength, primary: true, readout: 'L ' + Math.round(params.ropeLength) + ' px' },
                    { id: 'mass', label: '砝碼', x: params.massWidth / 2, y: params.massHeight, readout: Math.round(params.massWidth) + ' × ' + Math.round(params.massHeight) + ' px' }
                ];
            },
            hitTest: function (item, point, padding) {
                var params = paramsFor(item, 'hangingMass');
                return distanceToSegment(point, { x: 0, y: -params.ropeLength }, { x: 0, y: 0 }) <= padding + 3
                    || (point.x >= -params.massWidth / 2 - padding && point.x <= params.massWidth / 2 + padding
                        && point.y >= -padding && point.y <= params.massHeight + padding);
            },
            update: function (item, handleId, localPoint) {
                var params = paramsFor(item, 'hangingMass');
                if (handleId === 'rope') params.ropeLength = clampNumber(Math.abs(localPoint.y), 20, 300, params.ropeLength);
                else if (handleId === 'mass') {
                    params.massWidth = clampNumber(Math.abs(localPoint.x) * 2, 24, 140, params.massWidth);
                    params.massHeight = clampNumber(Math.abs(localPoint.y), 24, 160, params.massHeight);
                } else return null;
                item.params = hangingMassParametric.sanitize(params);
                return { readout: 'L ' + Math.round(item.params.ropeLength) + ' px' };
            }
        }
    );

    function simpleBounds(width, height, padding) {
        var extra = padding || 8;
        return { left: -width / 2 - extra, top: -height / 2 - extra, right: width / 2 + extra, bottom: height / 2 + extra };
    }

    var batteryParametric = makeParametric(
        { cells: 2, span: 120 },
        [parameter('cells', '電池單體數', 2, 8, 1, '節'), parameter('span', '總長度', 80, 360, 1, 'px')],
        {
            sanitize: function (source) {
                var incoming = source && typeof source === 'object' ? source : {};
                var cells = Math.round(clampNumber(incoming.cells, 2, 8, 2));
                var minimumSpan = 34 + (cells * 2 - 1) * 10;
                return { cells: cells, span: oneDecimal(clampNumber(incoming.span, minimumSpan, 360, Math.max(120, minimumSpan))) };
            },
            bounds: function (item) { var p = paramsFor(item, 'battery'); return simpleBounds(p.span, 70); },
            handles: function (item) {
                var p = paramsFor(item, 'battery');
                return [
                    { id: 'span', label: '端點', x: p.span / 2, y: 0, primary: true, readout: Math.round(p.cells) + ' 節' }
                ];
            },
            update: function (item, handleId, localPoint) {
                var p = paramsFor(item, 'battery');
                if (handleId === 'span') p.span = clampNumber(Math.abs(localPoint.x) * 2, 34 + (p.cells * 2 - 1) * 10, 360, p.span);
                else if (handleId === 'cells') p.cells = clampNumber(Math.round(Math.abs(localPoint.x) / 12), 2, 8, p.cells);
                else return null;
                item.params = batteryParametric.sanitize(p);
                return { readout: Math.round(item.params.cells) + ' 節 · ' + Math.round(item.params.span) + ' px' };
            }
        }
    );

    function variableResistorParametricFor(type) {
        var config = makeParametric(
            { wiper: 0.35, span: 120 },
            [parameter('wiper', '滑片位置', -1, 1, 0.1, ''), parameter('span', '端點間距', 90, 520, 1, 'px')],
            {
            // Retain legacy wiper data for old projects, not as an electrical terminal.
            getControls: function () { return config.controls.filter(function (control) { return control.key !== 'wiper'; }); },
            bounds: function (item) { var p = paramsFor(item, type); return simpleBounds(p.span, 92); },
            handles: function (item) {
                var p = paramsFor(item, type);
                return [
                    { id: 'left-terminal', label: '左端', x: -p.span / 2, y: 0, readout: 'L ' + Math.round(p.span) + ' px' },
                    { id: 'right-terminal', label: '右端', x: p.span / 2, y: 0, readout: 'L ' + Math.round(p.span) + ' px' }
                ];
            },
            update: function (item, handleId, localPoint) {
                var p = paramsFor(item, type);
                if (handleId === 'left-terminal' || handleId === 'right-terminal') p.span = clampNumber(Math.abs(localPoint.x) * 2, 90, 520, p.span);
                else return null;
                item.params = config.sanitize(p);
                return { readout: '端點間距 ' + Math.round(item.params.span) + ' px' };
            }
        });
        return config;
    }

    var variableResistorParametric = variableResistorParametricFor('variableResistor');
    var variableResistorTaiwanParametric = variableResistorParametricFor('variableResistorTaiwan');

    function switchParametric(type, defaultAngle) {
        return makeParametric(
            { angle: defaultAngle, gap: 50 },
            [parameter('angle', '開關角度（0°閉合）', 0, 75, 1, '°'), parameter('gap', '接點間距', 30, 160, 1, 'px')],
            {
                bounds: function (item) {
                    var p = paramsFor(item, type);
                    var bladeHeight = Math.abs(Math.sin(-p.angle * DEG) * (p.gap - 8));
                    return simpleBounds(p.gap + 70, Math.max(72, bladeHeight * 2 + 24));
                },
                handles: function (item) {
                    var p = paramsFor(item, type);
                    var startX = -p.gap / 2 + 4;
                    var length = p.gap - 8;
                    var radians = -p.angle * DEG;
                    return [{
                        id: 'blade', label: '開關桿', x: startX + Math.cos(radians) * length,
                        y: Math.sin(radians) * length, primary: true,
                        readout: p.angle === 0 ? '閉合' : Math.round(p.angle) + '°'
                    }, { id: 'gap', label: '接點間距', x: p.gap / 2, y: 0, readout: Math.round(p.gap) + ' px' }];
                },
                update: function (item, handleId, localPoint, options) {
                    if (handleId === 'gap') {
                        var closedParams = paramsFor(item, type);
                        closedParams.gap = clampNumber(Math.abs(localPoint.x) * 2, 30, 160, closedParams.gap);
                        item.params = definitions[type].parametric.sanitize(closedParams);
                        return { readout: Math.round(item.params.gap) + ' px' };
                    }
                    if (handleId !== 'blade') return null;
                    var p = paramsFor(item, type);
                    var startX = -p.gap / 2 + 4;
                    p.angle = snapSemanticAngle(-Math.atan2(localPoint.y, localPoint.x - startX) / DEG, options, 0, 75);
                    item.params = definitions[type].parametric.sanitize(p);
                    return { readout: Math.round(item.params.angle) + '°' };
                }
            }
        );
    }

    var switchOpenParametric = switchParametric('switchOpen', 28);
    var switchClosedParametric = switchParametric('switchClosed', 0);

    function inductorShape(p) {
        var width = p.span / (p.coils - (p.coils - 1) * 0.22);
        return { width: width, height: width * 0.65, depth: width * 0.48 };
    }

    // Shared by standalone symbols and composed circuits.
    function drawInductorWinding(ctx, span, coils, centerX, centerY) {
        var shape = inductorShape({ span: span, coils: coils });
        var halfSpan = span / 2;
        begin(ctx);
        ctx.moveTo(centerX - halfSpan, centerY);
        for (var i = 0; i < coils; i += 1) {
            var start = centerX - halfSpan + i * shape.width * 0.78;
            var end = i === coils - 1 ? centerX + halfSpan : start + shape.width;
            ctx.bezierCurveTo(start, centerY - shape.height * 4 / 3, end, centerY - shape.height * 4 / 3, end, centerY);
            if (i < coils - 1) ctx.bezierCurveTo(end + shape.width * 0.1, centerY + shape.depth * 4 / 3, end - shape.width * 0.32, centerY + shape.depth * 4 / 3, end - shape.width * 0.22, centerY);
        }
        ctx.stroke();
    }

    function drawACSine(ctx, centerX, centerY, width, amplitude) {
        begin(ctx);
        for (var i = 0; i <= 64; i += 1) {
            var x = centerX - width / 2 + width * i / 64;
            var y = centerY - amplitude * Math.sin(2 * Math.PI * i / 64);
            if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    var inductorParametric = makeParametric(
        { coils: 4, span: 84, current: 0, showTerminals: 0 },
        [parameter('coils', '顯示圈數', 2, 12, 1, '圈'), parameter('span', '線圈長度', 44, 240, 1, 'px'),
            { key: 'current', label: '電流箭頭', kind: 'select', min: -1, max: 1, step: 1, unit: '', choices: [{ value: 0, label: '隱藏' }, { value: 1, label: '向右' }, { value: -1, label: '向左' }] },
            { key: 'showTerminals', label: '端點 a／b', kind: 'select', min: 0, max: 1, step: 1, unit: '', choices: [{ value: 0, label: '隱藏' }, { value: 1, label: '顯示' }] }],
        {
            bounds: function (item) {
                var p = paramsFor(item, 'inductor');
                var halfWidth = Math.max(65, p.span / 2 + 23);
                var shape = inductorShape(p);
                return { left: -halfWidth - 12, right: halfWidth + 12, top: -Math.max(shape.height + 32, 32), bottom: Math.max(shape.depth + 8, 16) };
            },
            handles: function (item) { var p = paramsFor(item, 'inductor'); return [{ id: 'span', label: '線圈端', x: p.span / 2, y: 0, primary: true, readout: Math.round(p.coils) + ' 圈' }]; },
            update: function (item, handleId, localPoint) {
                if (handleId !== 'span') return null;
                var p = paramsFor(item, 'inductor');
                p.span = clampNumber(Math.abs(localPoint.x) * 2, 44, 240, p.span);
                item.params = inductorParametric.sanitize(p);
                return { readout: Math.round(item.params.span) + ' px · ' + Math.round(item.params.coils) + ' 圈' };
            }
        }
    );

    function terminalSpanParametric(type, defaultSpan, bodyHalfWidth, height) {
        return makeParametric(
            { span: defaultSpan },
            [parameter('span', '端點間距', Math.max(bodyHalfWidth * 2 + 16, 60), 520, 1, 'px')],
            {
                bounds: function (item) {
                    var p = paramsFor(item, type);
                    return simpleBounds(p.span, height);
                },
                handles: function (item) {
                    var p = paramsFor(item, type);
                    var readout = 'L ' + Math.round(p.span) + ' px';
                    return [
                        { id: 'left-terminal', label: '左端', x: -p.span / 2, y: 0, readout: readout },
                        { id: 'right-terminal', label: '右端', x: p.span / 2, y: 0, primary: true, readout: readout }
                    ];
                },
                update: function (item, handleId, localPoint) {
                    if (handleId !== 'left-terminal' && handleId !== 'right-terminal') return null;
                    var p = paramsFor(item, type);
                    p.span = clampNumber(Math.abs(localPoint.x) * 2, Math.max(bodyHalfWidth * 2 + 16, 60), 520, p.span);
                    item.params = definitions[type].parametric.sanitize(p);
                    return { readout: 'L ' + Math.round(item.params.span) + ' px' };
                }
            }
        );
    }

    var terminalParametrics = {
        cell: terminalSpanParametric('cell', 100, 9, 58),
        resistor: terminalSpanParametric('resistor', 120, 34, 54),
        resistorTaiwan: terminalSpanParametric('resistorTaiwan', 120, 34, 54),
        lamp: terminalSpanParametric('lamp', 112, 28, 64),
        ammeter: terminalSpanParametric('ammeter', 116, 27, 62),
        voltmeter: terminalSpanParametric('voltmeter', 116, 27, 62),
        galvanometer: terminalSpanParametric('galvanometer', 116, 27, 62),
        motor: terminalSpanParametric('motor', 116, 27, 62),
        capacitor: terminalSpanParametric('capacitor', 110, 10, 62),
        polarizedCapacitor: terminalSpanParametric('polarizedCapacitor', 110, 28, 70),
        diode: terminalSpanParametric('diode', 120, 29, 60),
        led: terminalSpanParametric('led', 120, 42, 78),
        fuse: terminalSpanParametric('fuse', 120, 32, 48),
        acSource: terminalSpanParametric('acSource', 116, 28, 64)
    };

    var junctionParametric = makeParametric(
        { span: 70, branch: 15 },
        [parameter('span', '水平導線長', 40, 400, 1, 'px'), parameter('branch', '分支長度', 10, 240, 1, 'px')],
        {
            bounds: function (item) { var p = paramsFor(item, 'junction'); return { left: -p.span / 2 - 8, top: -p.branch - 8, right: p.span / 2 + 8, bottom: 8 }; },
            handles: function (item) {
                var p = paramsFor(item, 'junction');
                return [
                    { id: 'span', label: '水平端', x: p.span / 2, y: 0, readout: 'L ' + Math.round(p.span) + ' px' },
                    { id: 'branch', label: '分支端', x: 0, y: -p.branch, primary: true, readout: 'b ' + Math.round(p.branch) + ' px' }
                ];
            },
            update: function (item, handleId, localPoint) {
                var p = paramsFor(item, 'junction');
                if (handleId === 'span') p.span = clampNumber(Math.abs(localPoint.x) * 2, 40, 400, p.span);
                else if (handleId === 'branch') p.branch = clampNumber(Math.abs(localPoint.y), 10, 240, p.branch);
                else return null;
                item.params = junctionParametric.sanitize(p);
                return { readout: 'L ' + Math.round(item.params.span) + ' · b ' + Math.round(item.params.branch) + ' px' };
            }
        }
    );

    function verticalSpanParametric(type, defaultHeight, width) {
        return makeParametric(
            { height: defaultHeight },
            [parameter('height', '高度', 50, 500, 1, 'px')],
            {
                bounds: function (item) { var p = paramsFor(item, type); return simpleBounds(width, p.height); },
                handles: function (item) {
                    var p = paramsFor(item, type);
                    return [
                        { id: 'top', label: '上端', x: 0, y: -p.height / 2, primary: true, readout: 'H ' + Math.round(p.height) + ' px' },
                        { id: 'bottom', label: '下端', x: 0, y: p.height / 2, readout: 'H ' + Math.round(p.height) + ' px' }
                    ];
                },
                update: function (item, handleId, localPoint) {
                    if (handleId !== 'top' && handleId !== 'bottom') return null;
                    var p = paramsFor(item, type);
                    p.height = clampNumber(Math.abs(localPoint.y) * 2, 50, 500, p.height);
                    item.params = definitions[type].parametric.sanitize(p);
                    return { readout: 'H ' + Math.round(item.params.height) + ' px' };
                }
            }
        );
    }

    var barrierParametric = verticalSpanParametric('barrier', 130, 38);
    var planeMirrorParametric = verticalSpanParametric('planeMirror', 130, 42);
    var screenParametric = verticalSpanParametric('screen', 130, 42);

    var planeWaveParametric = makeParametric(
        { length: 130, height: 90, wavelength: 24, startX: null },
        [
            parameter('length', '波列長度', 70, 500, 1, 'px'),
            parameter('height', '波前高度', 40, 300, 1, 'px'),
            parameter('wavelength', '波長 λ', 10, 100, 1, 'px')
        ],
        {
            sanitize: function (source) {
                var p = sanitizedByControls(planeWaveParametric.defaults, planeWaveParametric.controls, source);
                p.startX = source && source.startX != null ? clampNumber(source.startX, -240, -25, 10 - p.length / 2) : 10 - p.length / 2;
                // Keep two full wavefronts visible without changing the requested wavelength.
                p.length = Math.max(p.length, p.wavelength + 40);
                return p;
            },
            getControls: function (item) {
                var p = paramsFor(item, 'planeWave');
                return planeWaveParametric.controls.map(function (c) { return c.key === 'length' ? Object.assign({}, c, { min: Math.max(70, p.wavelength + 40) }) : c; });
            },
            bounds: function (item) { var p = paramsFor(item, 'planeWave'); return { left: p.startX - 18, right: p.startX + p.length - 2, top: -p.height / 2 - 8, bottom: p.height / 2 + 8 }; },
            handles: function (item) {
                var p = paramsFor(item, 'planeWave');
                return [
                    { id: 'extent', label: '範圍', x: p.startX + p.length - 10, y: p.height / 2, primary: true, readout: Math.round(p.length) + ' × ' + Math.round(p.height) + ' px' },
                    { id: 'wavelength', label: '波長', x: p.startX + p.wavelength, y: 0, readout: 'λ ' + Math.round(p.wavelength) + ' px' }
                ];
            },
            update: function (item, handleId, localPoint) {
                var p = paramsFor(item, 'planeWave');
                if (handleId === 'extent') {
                    p.length = clampNumber(localPoint.x - p.startX + 10, 70, 500, p.length);
                    p.height = clampNumber(Math.abs(localPoint.y) * 2, 40, 300, p.height);
                } else if (handleId === 'wavelength') {
                    p.wavelength = clampNumber(localPoint.x - p.startX, 10, 100, p.wavelength);
                } else return null;
                item.params = planeWaveParametric.sanitize(p);
                return { readout: 'λ ' + Math.round(item.params.wavelength) + ' px' };
            }
        }
    );

    function radialWaveParametric(type, defaultRadius, defaultWavelength, minimumRadius, maximumRadius, minimumWavelength, maximumWavelength) {
        var config = makeParametric(
            { radius: defaultRadius, wavelength: defaultWavelength },
            [parameter('radius', '波前顯示半徑', minimumRadius, maximumRadius, 1, 'px'), parameter('wavelength', '波長 λ', minimumWavelength, maximumWavelength, 1, 'px')],
            {
            sanitize: function (source) {
                var p = sanitizedByControls(config.defaults, config.controls, source);
                p.radius = Math.max(p.radius, 2 * p.wavelength);
                return p;
            },
            getControls: function (item) {
                var p = paramsFor(item, type);
                return config.controls.map(function (c) { return c.key === 'radius' ? Object.assign({}, c, { min: Math.max(minimumRadius, 2 * p.wavelength) }) : c; });
            },
            bounds: function (item) { var p = paramsFor(item, type); return simpleBounds(p.radius * 2, p.radius * 2, type === 'pointSource' ? 24 : 8); },
            handles: function (item) {
                var p = paramsFor(item, type);
                return [
                    { id: 'radius', label: '顯示範圍', x: p.radius / Math.SQRT2, y: p.radius / Math.SQRT2, primary: true, readout: 'r ' + p.radius + ' px（至少 2λ）' },
                    { id: 'wavelength', label: '波長', x: p.wavelength, y: 0, readout: 'λ ' + Math.round(p.wavelength) + ' px' }
                ];
            },
            hitTest: function (item, point, padding) {
                var p = paramsFor(item, type);
                var distance = Math.hypot(point.x, point.y);
                var ring = Math.max(1, Math.round(distance / p.wavelength));
                return distance <= 8 + padding || (ring * p.wavelength <= p.radius + 1 && Math.abs(distance - ring * p.wavelength) <= padding + 3);
            },
            update: function (item, handleId, localPoint) {
                var p = paramsFor(item, type);
                var distance = Math.hypot(localPoint.x, localPoint.y);
                if (handleId === 'radius') p.radius = clampNumber(distance, minimumRadius, maximumRadius, p.radius);
                else if (handleId === 'wavelength') p.wavelength = clampNumber(distance, minimumWavelength, maximumWavelength, p.wavelength);
                else return null;
                item.params = config.sanitize(p);
                return { readout: 'r ' + Math.round(item.params.radius) + ' · λ ' + Math.round(item.params.wavelength) + ' px' };
            }
        }
        );
        return config;
    }

    var circularWaveParametric = radialWaveParametric('circularWave', 56, 14, 24, 220, 8, 70);

    function sineWaveUnit(p, distance) {
        return Math.sin(2 * Math.PI * distance / p.wavelength + p.phase * DEG);
    }

    function sineWaveAmplitudePoint(p) {
        // Choose a visible point away from the endpoint and wavelength handles.
        // This depends on phase/length, not amplitude, so vertical dragging stays stable.
        var margin = 12;
        var segments = [[margin, p.length - margin]];
        if (p.length >= p.wavelength + 14) segments = [[margin, Math.min(p.length - margin, p.wavelength - 16)], [Math.max(margin, p.wavelength + 16), p.length - margin]];
        var candidates = [];
        segments.forEach(function (range) {
            if (range[1] < range[0]) return;
            candidates.push(range[0], range[1]);
            var first = p.wavelength * (0.25 - p.phase / 360);
            var n = Math.ceil((range[0] - first) / (p.wavelength / 2));
            for (var s = first + n * p.wavelength / 2; s <= range[1] + 1e-8; s += p.wavelength / 2) candidates.push(s);
        });
        candidates.sort(function (a, b) {
            var ya = sineWaveUnit(p, a), yb = sineWaveUnit(p, b);
            if (Math.abs(Math.abs(ya) - Math.abs(yb)) > 1e-8) return Math.abs(yb) - Math.abs(ya);
            if (Math.sign(ya) !== Math.sign(yb)) return yb - ya;
            return Math.abs(a - p.length / 3) - Math.abs(b - p.length / 3);
        });
        var distance = candidates[0];
        return { x: p.startX + distance, unit: sineWaveUnit(p, distance) };
    }

    var sineWaveParametric = makeParametric(
        { length: 150, amplitude: 28, wavelength: 75, startX: null, phase: 0, direction: 0, showBaseline: 0 },
        [
            parameter('length', '波形長度', 60, 700, 1, 'px'),
            parameter('amplitude', '振幅 A', 0, 120, 1, 'px'),
            parameter('wavelength', '波長 λ', 20, 300, 1, 'px'),
            parameter('phase', '左端初相位 φ', -180, 180, 1, '°'),
            { key: 'direction', label: '傳播方向標示', min: -1, max: 1, step: 1, kind: 'select', choices: [{ value: 0, label: '不標示（僅波形快照）' }, { value: 1, label: '沿圖向右傳播' }, { value: -1, label: '沿圖向左傳播' }] },
            { key: 'showBaseline', label: '平衡位置虛線', min: 0, max: 1, step: 1, kind: 'select', choices: [{ value: 0, label: '隱藏' }, { value: 1, label: '顯示' }] }
        ],
        {
            sanitize: function (source) {
                var p = sanitizedByControls(sineWaveParametric.defaults, sineWaveParametric.controls, source);
                p.startX = source && source.startX != null ? clampNumber(source.startX, -350, -30, -p.length / 2) : -p.length / 2;
                return p;
            },
            bounds: function (item) { var p = paramsFor(item, 'sineWave'); return { left: p.startX - 8, right: p.startX + p.length + 8, top: -p.amplitude - (p.direction ? 46 : 8), bottom: p.amplitude + 8 }; },
            handles: function (item) {
                var p = paramsFor(item, 'sineWave');
                var amplitude = sineWaveAmplitudePoint(p);
                var handles = [
                    { id: 'length', label: '右端', x: p.startX + p.length, y: -p.amplitude * sineWaveUnit(p, p.length), readout: 'L ' + p.length + ' px；左端固定' },
                    { id: 'amplitude', label: Math.abs(amplitude.unit) < 0.999 ? '振幅（片段）' : (amplitude.unit > 0 ? '振幅（波峰）' : '振幅（波谷）'), x: amplitude.x, y: -p.amplitude * amplitude.unit, primary: true, readout: 'A ' + p.amplitude + ' px' }
                ];
                if (p.length >= p.wavelength + 14) handles.push({ id: 'wavelength', label: '一個波長', x: p.startX + p.wavelength, y: -p.amplitude * sineWaveUnit(p, 0), readout: 'λ ' + p.wavelength + ' px；相對左端同相位' });
                return handles;
            },
            hitTest: function (item, point, padding) {
                var p = paramsFor(item, 'sineWave');
                if (p.direction) {
                    var middle = p.startX + p.length / 2;
                    if (Math.abs(point.x - middle) <= 24 + padding && Math.abs(point.y + p.amplitude + 20) <= padding + 3) return true;
                    if (Math.abs(point.x - middle) <= 8 + padding && Math.abs(point.y + p.amplitude + 35) <= padding + 5) return true;
                }
                if (point.x < p.startX - padding || point.x > p.startX + p.length + padding) return false;
                if (p.showBaseline && distanceToSegment(point, { x: p.startX, y: 0 }, { x: p.startX + p.length, y: 0 }) <= padding) return true;
                var from = Math.max(0, point.x - p.startX - padding - 4);
                var to = Math.min(p.length, point.x - p.startX + padding + 4);
                var count = Math.max(1, Math.ceil(Math.max((to - from) / 2, (to - from) / p.wavelength * 48)));
                var previous = { x: p.startX + from, y: -p.amplitude * sineWaveUnit(p, from) };
                for (var i = 1; i <= count; i++) {
                    var s = from + (to - from) * i / count;
                    var next = { x: p.startX + s, y: -p.amplitude * sineWaveUnit(p, s) };
                    if (distanceToSegment(point, previous, next) <= padding + 4) return true;
                    previous = next;
                }
                return false;
            },
            update: function (item, handleId, localPoint) {
                var p = paramsFor(item, 'sineWave');
                if (handleId === 'length') p.length = clampNumber(localPoint.x - p.startX, 60, 700, p.length);
                else if (handleId === 'amplitude') p.amplitude = clampNumber(-localPoint.y / sineWaveAmplitudePoint(p).unit, 0, 120, p.amplitude);
                else if (handleId === 'wavelength' && p.length >= p.wavelength + 14) p.wavelength = clampNumber(localPoint.x - p.startX, 20, Math.min(300, p.length - 14), p.wavelength);
                else return null;
                item.params = sineWaveParametric.sanitize(p);
                return { readout: 'A ' + Math.round(item.params.amplitude) + ' · λ ' + Math.round(item.params.wavelength) + ' px' };
            }
        }
    );

    function slitParametric(type, openings) {
        var defaults = openings === 1
            ? { height: 130, aperture: 26, separation: 0 }
            : { height: 130, aperture: 16, separation: 38 };
        var controls = [parameter('height', '擋板高度', 60, 420, 1, 'px'), parameter('aperture', '縫寬', 6, 80, 1, 'px')];
        if (openings === 2) controls.push(parameter('separation', '雙縫中心距', 18, 160, 1, 'px'));
        return makeParametric(defaults, controls, {
            sanitize: function (source) {
                var incoming = source && typeof source === 'object' ? source : {};
                var aperture = oneDecimal(clampNumber(incoming.aperture, 6, 80, defaults.aperture));
                var separation = openings === 2
                    ? oneDecimal(clampNumber(incoming.separation, aperture + 10, 160, Math.max(defaults.separation, aperture + 10)))
                    : 0;
                var minimumHeight = aperture + 60 + (openings === 2 ? separation : 0);
                return {
                    height: oneDecimal(clampNumber(incoming.height, minimumHeight, 420, Math.max(defaults.height, minimumHeight))),
                    aperture: aperture,
                    separation: separation
                };
            },
            bounds: function (item) { var p = paramsFor(item, type); return simpleBounds(42, p.height); },
            handles: function (item) {
                var p = paramsFor(item, type);
                var y = openings === 1 ? p.aperture / 2 : p.separation / 2 + p.aperture / 2;
                var handles = [{ id: 'aperture', label: '縫邊', x: 0, y: y, primary: true, readout: 'a ' + Math.round(p.aperture) + ' px' }];
                if (openings === 2) handles.push({ id: 'separation', label: '縫距', x: 0, y: p.separation / 2, readout: 'd ' + Math.round(p.separation) + ' px' });
                handles.push({ id: 'height', label: '擋板端', x: 0, y: p.height / 2, readout: 'H ' + Math.round(p.height) + ' px' });
                return handles;
            },
            update: function (item, handleId, localPoint) {
                var p = paramsFor(item, type);
                if (handleId === 'height') p.height = clampNumber(Math.abs(localPoint.y) * 2, 60, 420, p.height);
                else if (handleId === 'aperture') {
                    p.aperture = openings === 1
                        ? clampNumber(Math.abs(localPoint.y) * 2, 6, 80, p.aperture)
                        : clampNumber((Math.abs(localPoint.y) - p.separation / 2) * 2, 6, 80, p.aperture);
                } else if (handleId === 'separation' && openings === 2) {
                    p.separation = clampNumber(Math.abs(localPoint.y) * 2, 18, 160, p.separation);
                } else return null;
                item.params = definitions[type].parametric.sanitize(p);
                return { readout: 'a ' + Math.round(item.params.aperture) + (openings === 2 ? ' · d ' + Math.round(item.params.separation) : '') + ' px' };
            }
        });
    }

    var singleSlitParametric = slitParametric('singleSlit', 1);
    var doubleSlitParametric = slitParametric('doubleSlit', 2);

    function lensParametric(type, concave) {
        return makeParametric(
            { height: 130, curvature: concave ? 24 : 35 },
            [parameter('height', '鏡片高度', 60, 400, 1, 'px'), parameter('curvature', '輪廓寬度參數', 12, 80, 1, 'px')],
            {
                bounds: function (item) { var p = paramsFor(item, type); return simpleBounds(p.curvature * 2 + 10, p.height); },
                handles: function (item) {
                    var p = paramsFor(item, type);
                    return [
                        { id: 'height', label: '鏡片端', x: 0, y: -p.height / 2, readout: 'H ' + Math.round(p.height) + ' px' },
                        { id: 'curvature', label: concave ? '鏡片腰部' : '鏡片厚度', x: p.curvature * (concave ? 0.5 : 0.75), y: 0, primary: true, readout: '輪廓寬度 ' + Math.round(p.curvature) + ' px' }
                    ];
                },
                update: function (item, handleId, localPoint) {
                    var p = paramsFor(item, type);
                    if (handleId === 'height') p.height = clampNumber(Math.abs(localPoint.y) * 2, 60, 400, p.height);
                    else if (handleId === 'curvature') p.curvature = clampNumber(Math.abs(localPoint.x) / (concave ? 0.5 : 0.75), 12, 80, p.curvature);
                    else return null;
                    item.params = definitions[type].parametric.sanitize(p);
                    return { readout: 'H ' + Math.round(item.params.height) + ' · C ' + Math.round(item.params.curvature) + ' px' };
                }
            }
        );
    }

    var convexLensParametric = lensParametric('convexLens', false);
    var concaveLensParametric = lensParametric('concaveLens', true);

    var prismParametric = makeParametric(
        { width: 110, height: 100, apex: 0 },
        [parameter('width', '底寬', 50, 360, 1, 'px'), parameter('height', '高度', 50, 360, 1, 'px'), parameter('apex', '頂點偏移', -0.8, 0.8, 0.1, '')],
        {
            bounds: function (item) { var p = paramsFor(item, 'prism'); return simpleBounds(p.width, p.height); },
            handles: function (item) {
                var p = paramsFor(item, 'prism');
                return [
                    { id: 'apex', label: '頂點', x: p.apex * p.width / 2, y: -p.height / 2, primary: true, readout: Math.round(p.width) + ' × ' + Math.round(p.height) + ' px' },
                    { id: 'base', label: '底角', x: p.width / 2, y: p.height / 2, readout: Math.round(p.width) + ' × ' + Math.round(p.height) + ' px' }
                ];
            },
            update: function (item, handleId, localPoint) {
                var p = paramsFor(item, 'prism');
                if (handleId === 'apex') {
                    p.apex = clampNumber(localPoint.x / (p.width / 2), -0.8, 0.8, p.apex);
                    p.height = clampNumber(Math.abs(localPoint.y) * 2, 50, 360, p.height);
                } else if (handleId === 'base') {
                    p.width = clampNumber(Math.abs(localPoint.x) * 2, 50, 360, p.width);
                    p.height = clampNumber(Math.abs(localPoint.y) * 2, 50, 360, p.height);
                } else return null;
                item.params = prismParametric.sanitize(p);
                return { readout: Math.round(item.params.width) + ' × ' + Math.round(item.params.height) + ' px' };
            }
        }
    );

    var pointSourceParametric = radialWaveParametric('pointSource', 25, 10, 15, 180, 6, 60);

    function propagationParametric(type, doubleSource) {
        var defaults = doubleSource
            ? { range: 160, height: 130, wavelength: 24, separation: 44, aperture: 0 }
            : { range: 150, height: 120, wavelength: 24, separation: 0, aperture: 22 };
        var controls = [
            parameter('range', '傳播距離', 80, 520, 1, 'px'),
            parameter('height', '圖形高度', 70, 360, 1, 'px'),
            parameter('wavelength', '波長 λ', 10, 80, 1, 'px')
        ];
        controls.push(doubleSource
            ? parameter('separation', '波源間距', 16, 160, 1, 'px')
            : parameter('aperture', '縫寬', 6, 90, 1, 'px'));
        return makeParametric(defaults, controls, {
            sanitize: function (source) {
                var p = sanitizedByControls(defaults, controls, source);
                p.height = doubleSource
                    ? Math.max(p.height, p.separation + 36)
                    : Math.max(p.height, p.aperture + 30);
                return p;
            },
            bounds: function (item) { var p = paramsFor(item, type); return simpleBounds(p.range, p.height); },
            handles: function (item) {
                var p = paramsFor(item, type);
                var feature = doubleSource ? p.separation / 2 : p.aperture / 2;
                return [
                    { id: 'extent', label: '傳播範圍', x: p.range / 2, y: p.height / 2, primary: true, readout: 'λ ' + Math.round(p.wavelength) + ' px' },
                    { id: 'wavelength', label: '波長', x: -p.range / 2 + 20 + p.wavelength, y: 0, readout: 'λ ' + Math.round(p.wavelength) + ' px' },
                    { id: 'feature', label: doubleSource ? '波源距' : '縫寬', x: -p.range / 2 + 20, y: feature, readout: (doubleSource ? 'd ' : 'a ') + Math.round(feature * 2) + ' px' }
                ];
            },
            update: function (item, handleId, localPoint) {
                var p = paramsFor(item, type);
                if (handleId === 'extent') {
                    p.range = clampNumber(Math.abs(localPoint.x) * 2, 80, 520, p.range);
                    p.height = clampNumber(Math.abs(localPoint.y) * 2, 70, 360, p.height);
                } else if (handleId === 'wavelength') p.wavelength = clampNumber(localPoint.x + p.range / 2 - 20, 10, 80, p.wavelength);
                else if (handleId === 'feature') {
                    if (doubleSource) p.separation = clampNumber(Math.abs(localPoint.y) * 2, 16, 160, p.separation);
                    else p.aperture = clampNumber(Math.abs(localPoint.y) * 2, 6, 90, p.aperture);
                } else return null;
                item.params = definitions[type].parametric.sanitize(p);
                return { readout: 'λ ' + Math.round(item.params.wavelength) + ' px' };
            }
        });
    }

    var diffractionParametric = propagationParametric('diffraction', false);
    var interferenceParametric = propagationParametric('interference', true);

    function sphericalMirrorState(params, convex) {
        var halfHeight = params.height / 2;
        var radius = Math.max(params.radius, halfHeight + 2);
        var centerOffset = Math.sqrt(Math.max(0, radius * radius - halfHeight * halfHeight));
        var sagitta = radius - centerOffset;
        return {
            halfHeight: halfHeight,
            radius: radius,
            centerX: convex ? centerOffset : -centerOffset,
            vertexX: convex ? -sagitta : sagitta,
            sagitta: sagitta
        };
    }

    function drawSphericalMirror(ctx, params, convex) {
        var state = sphericalMirrorState(params, convex);
        var halfAngle = Math.asin(state.halfHeight / state.radius);
        begin(ctx);
        if (convex) {
            ctx.arc(state.centerX, 0, state.radius, Math.PI - halfAngle, Math.PI + halfAngle);
        } else {
            ctx.arc(state.centerX, 0, state.radius, -halfAngle, halfAngle);
        }
        ctx.stroke();

        for (var y = -state.halfHeight + 6; y <= state.halfHeight - 6; y += 13) {
            var radialX = Math.sqrt(Math.max(0, state.radius * state.radius - y * y));
            var curveX = state.centerX + (convex ? -radialX : radialX);
            strokePath(ctx, [[curveX, y], [curveX + 10, y + 6]]);
        }
    }

    function mirrorParametric(type, convex) {
        return makeParametric(
            { height: 130, radius: 90 },
            [parameter('height', '鏡面高度', 60, 400, 1, 'px'), parameter('radius', '曲率半徑', 35, 240, 1, 'px')],
            {
                sanitize: function (params) {
                    var height = oneDecimal(clampNumber(params.height, 60, 400, 130));
                    var minimumRadius = Math.max(35, height / 2 + 2);
                    return {
                        height: height,
                        radius: oneDecimal(clampNumber(params.radius, minimumRadius, 240, 90))
                    };
                },
                bounds: function (item) {
                    var p = paramsFor(item, type);
                    var state = sphericalMirrorState(p, convex);
                    return convex
                        ? { left: -state.sagitta - 8, top: -state.halfHeight - 8, right: 18, bottom: state.halfHeight + 8 }
                        : { left: -8, top: -state.halfHeight - 8, right: state.sagitta + 18, bottom: state.halfHeight + 8 };
                },
                handles: function (item) {
                    var p = paramsFor(item, type);
                    var state = sphericalMirrorState(p, convex);
                    return [
                        { id: 'height', label: '鏡面端', x: 0, y: -p.height / 2, readout: 'H ' + Math.round(p.height) + ' px' },
                        { id: 'radius', label: '曲率', x: state.vertexX, y: 0, primary: true, readout: 'R ' + Math.round(p.radius) + ' px' }
                    ];
                },
                update: function (item, handleId, localPoint) {
                    var p = paramsFor(item, type);
                    if (handleId === 'height') p.height = clampNumber(Math.abs(localPoint.y) * 2, 60, 400, p.height);
                    else if (handleId === 'radius') {
                        var halfHeight = p.height / 2;
                        var sagitta = clampNumber(Math.abs(localPoint.x), 4, halfHeight * 0.98, 16);
                        p.radius = (halfHeight * halfHeight + sagitta * sagitta) / (2 * sagitta);
                    }
                    else return null;
                    item.params = definitions[type].parametric.sanitize(p);
                    return { readout: 'R ' + Math.round(item.params.radius) + ' px' };
                }
            }
        );
    }

    var concaveMirrorParametric = mirrorParametric('concaveMirror', false);
    var convexMirrorParametric = mirrorParametric('convexMirror', true);

    function graphArea(item) {
        var definition = getDefinition(item.type);
        var metrics = getMetrics(item, definition);
        return {
            left: -metrics.width / 2 + 12,
            right: metrics.width / 2 - 8,
            top: -metrics.height / 2 + 8,
            bottom: metrics.height / 2 - 14,
            width: metrics.width,
            height: metrics.height
        };
    }

    function graphPoint(area, xRatio, yRatio) {
        return {
            x: area.left + (area.right - area.left) * xRatio,
            y: area.bottom - (area.bottom - area.top) * yRatio
        };
    }

    function signedGraphPoint(area, xRatio, value) {
        var halfHeight = (area.bottom - area.top) / 2;
        return { x: area.left + (area.right - area.left) * xRatio, y: area.zero - halfHeight * value * 0.88 };
    }

    var axesParametric = makeParametric({}, [], {
        bounds: function (item) { var area = graphArea(item); return simpleBounds(area.width, area.height, 4); },
        handles: function (item) {
            var area = graphArea(item);
            return [
                { id: 'x-axis', label: 'x 軸', x: area.right, y: area.bottom, primary: true, readout: Math.round(area.width) + ' × ' + Math.round(area.height) + ' px' },
                { id: 'y-axis', label: 'y 軸', x: area.left, y: area.top, readout: Math.round(area.width) + ' × ' + Math.round(area.height) + ' px' }
            ];
        },
        update: function (item, handleId, localPoint) {
            var area = graphArea(item);
            if (handleId === 'x-axis') item.width = clampNumber((localPoint.x - area.left) + 20, 90, 600, item.width);
            else if (handleId === 'y-axis') item.height = clampNumber((area.bottom - localPoint.y) + 22, 70, 420, item.height);
            else return null;
            return { readout: Math.round(item.width) + ' × ' + Math.round(item.height) + ' px' };
        }
    });

    function graphSeriesParametric(type, points, labels) {
        var defaults = {};
        var controls = [];
        points.forEach(function (point, index) {
            defaults[point.key] = point.y;
            controls.push(parameter(point.key, labels[index] || ('資料點 ' + (index + 1)), 0, 1, 0.1, ''));
        });
        return makeParametric(defaults, controls, {
            bounds: function (item) { var area = graphArea(item); return simpleBounds(area.width, area.height, 4); },
            handles: function (item) {
                var params = paramsFor(item, type);
                var area = graphArea(item);
                return points.map(function (point, index) {
                    var position = graphPoint(area, point.x, params[point.key]);
                    return {
                        id: point.key,
                        label: labels[index] || ('資料點 ' + (index + 1)),
                        x: position.x,
                        y: position.y,
                        primary: index === points.length - 1,
                        readout: (labels[index] || ('P' + (index + 1))) + ' ' + oneDecimal(params[point.key])
                    };
                });
            },
            update: function (item, handleId, localPoint) {
                var point = points.find(function (candidate) { return candidate.key === handleId; });
                if (!point) return null;
                var params = paramsFor(item, type);
                var area = graphArea(item);
                params[point.key] = clampNumber((area.bottom - localPoint.y) / (area.bottom - area.top), 0, 1, params[point.key]);
                item.params = definitions[type].parametric.sanitize(params);
                return { readout: (labels[points.indexOf(point)] || handleId) + ' ' + oneDecimal(item.params[point.key]) };
            }
        });
    }

    var lineGraphParametric = graphSeriesParametric(
        'lineGraph',
        [{ key: 'start', x: 0, y: 0.12 }, { key: 'end', x: 0.94, y: 0.86 }],
        ['起點高度', '終點高度']
    );
    var curveGraphParametric = graphSeriesParametric(
        'curveGraph',
        [{ key: 'start', x: 0, y: 0.07 }, { key: 'control', x: 0.58, y: 0.12 }, { key: 'end', x: 0.94, y: 0.92 }],
        ['起點', '曲線控制點', '終點']
    );
    var pointGraphParametric = graphSeriesParametric(
        'pointGraph',
        [
            { key: 'p1', x: 0.12, y: 0.24 }, { key: 'p2', x: 0.28, y: 0.34 },
            { key: 'p3', x: 0.43, y: 0.49 }, { key: 'p4', x: 0.58, y: 0.54 },
            { key: 'p5', x: 0.72, y: 0.73 }, { key: 'p6', x: 0.87, y: 0.79 }
        ],
        ['點 1', '點 2', '點 3', '點 4', '點 5', '點 6']
    );
    function validateDataRows(rows, kind) {
        if (kind === 'scatter' || kind === 'bars') {
            if (!Array.isArray(rows) || rows.length < 1 || rows.length > 32) return '請輸入 1 至 32 筆資料。';
            for (var j = 0; j < rows.length; j += 1) {
                if (!Array.isArray(rows[j]) || rows[j].length !== 2 || rows[j].some(function (v) { return typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 1000000; })) return '第 ' + (j + 1) + ' 筆須有兩個有效數字，絕對值不超過 1000000。';
                if (kind === 'bars' && rows.slice(0, j).some(function (r) { return Math.abs(r[0] - rows[j][0]) < 1e-8; })) return '長條的 x／類別編號不可重複或過於接近。';
            }
            return '';
        }
        if (kind === 'transitions') {
            if (!Array.isArray(rows) || rows.length < 1 || rows.length > 6) return '請輸入 1 至 6 組躍遷。';
            for (var t = 0; t < rows.length; t += 1) {
                var pair = rows[t];
                if (!Array.isArray(pair) || pair.length !== 2 || !Number.isInteger(pair[0]) || !Number.isInteger(pair[1]) || pair[0] < 1 || pair[0] > 7 || pair[1] < 0 || pair[1] > 7 || pair[0] === pair[1]) return '第 ' + (t + 1) + ' 組須為不同的整數能階：起點 1～7，終點 1～7 或 0（游離）。';
            }
            return '';
        }
        var segments = kind === 'accelerationSegments';
        if (!Array.isArray(rows) || rows.length < (segments ? 1 : 2) || rows.length > (segments ? 16 : 32)) return segments ? '請輸入 1 至 16 個加速度區段。' : '請輸入 2 至 32 筆資料。';
        var columns = kind === 'measurement' ? 3 : 2;
        for (var i = 0; i < rows.length; i += 1) {
            var row = rows[i];
            if (!Array.isArray(row) || row.length !== columns || row.some(function (v) { return typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 1000000; })) return '第 ' + (i + 1) + ' 筆須有 ' + columns + ' 個有效數字，絕對值不超過 1000000。';
            if (kind === 'measurement' && row[2] < 0) return '第 ' + (i + 1) + ' 筆的不確定度 dy 不可為負值。';
            if (kind === 'time' && (row[0] < 0 || (i > 0 && row[0] < rows[i - 1][0]))) return '第 ' + (i + 1) + ' 筆時間不可為負，且須依時間先後排列。';
            if (kind === 'position' && (row[0] < 0 || (i > 0 && row[0] <= rows[i - 1][0]))) return '位置圖的時間須非負且嚴格遞增，不能在同一瞬間有兩個位置。';
            if (kind === 'ordered' && i > 0 && row[0] < rows[i - 1][0]) return '第 ' + (i + 1) + ' 筆 x 須依小到大排列；同一 x 可用兩點表示跳變。';
            if (segments && (row[0] < 0.001 || row[0] > 1000 || Math.abs(row[1]) > 1000)) return '第 ' + (i + 1) + ' 段的時間長度須為 0.001～1000 s，加速度絕對值不可超過 1000 m/s²。';
        }
        if (segments) return rows.reduce(function (sum, r) { return sum + r[0]; }, 0) <= 10000 ? '' : '總時間不可超過 10000 s。';
        var xs = rows.map(function (row) { return row[0]; });
        if (Math.max.apply(null, xs) - Math.min.apply(null, xs) < 1e-8) return '至少需要兩個不同的 x／時間值，間距須大於或等於 0.00000001。';
        return '';
    }

    // Piecewise-linear integrals: zero-width jumps carry no area, and bounds
    // outside the provided domain are not silently extrapolated.
    function integrateLinearData(rows, from, to) {
        var lo = Math.max(rows[0][0], Math.min(from, to)); var hi = Math.min(rows[rows.length - 1][0], Math.max(from, to));
        var sum = 0;
        for (var i = 1; i < rows.length; i += 1) {
            var a = rows[i - 1]; var b = rows[i]; var dx = b[0] - a[0];
            var start = Math.max(lo, a[0]); var end = Math.min(hi, b[0]);
            if (dx <= 0 || end <= start) continue;
            var first = a[1] + (b[1] - a[1]) * (start - a[0]) / dx;
            var last = a[1] + (b[1] - a[1]) * (end - a[0]) / dx;
            sum += (first + last) * 0.5 * (end - start);
        }
        return from <= to ? sum : -sum;
    }

    function integrateAccelerationSegments(segments, initialPosition, initialVelocity) {
        var time = 0; var x = initialPosition; var v = initialVelocity;
        var result = { position: [[0, x]], velocity: [[0, v]], acceleration: [] };
        segments.forEach(function (r) {
            var duration = r[0]; var a = r[1]; var samples = [];
            for (var i = 1; i <= 24; i += 1) samples.push(duration * i / 24);
            var turningTime = a ? -v / a : -1;
            if (turningTime > 0 && turningTime < duration) samples.push(turningTime);
            samples.sort(function (l, r) { return l - r; }).forEach(function (t) { result.position.push([time + t, x + v * t + 0.5 * a * t * t]); });
            result.acceleration.push([time, a], [time + duration, a]);
            x += v * duration + 0.5 * a * duration * duration; v += a * duration; time += duration;
            result.velocity.push([time, v]);
        });
        result.end = { time: time, position: x, velocity: v };
        return result;
    }

    function dataTickStep(span, count) {
        var raw = Math.max(span, 1e-300) / count;
        var power = Math.pow(10, Math.floor(Math.log10(raw)));
        var ratio = raw / power;
        return (ratio < 1.5 ? 1 : ratio < 3.5 ? 2 : ratio < 7.5 ? 5 : 10) * power;
    }
    function dataTicks(lo, hi, count) {
        var step = dataTickStep(hi - lo, count); var values = [];
        var first = Math.ceil(lo / step - 1e-8); var last = Math.floor(hi / step + 1e-8);
        for (var i = first; i <= last && values.length < 12; i += 1) values.push(Number((i * step).toPrecision(8)));
        return values;
    }

    function dataDomain(rows, kind) {
        var xs = rows.map(function (row) { return row[0]; });
        var lows = rows.map(function (row) { return row[1] - (kind === 'measurement' ? row[2] : 0); });
        var highs = rows.map(function (row) { return row[1] + (kind === 'measurement' ? row[2] : 0); });
        var lo = Math.min(0, Math.min.apply(null, lows)); var hi = Math.max(0, Math.max.apply(null, highs));
        var gap = (hi - lo || 1) * 0.12;
        var step = dataTickStep(hi - lo || 1, 4);
        var minX = Math.min(0, Math.min.apply(null, xs)); var maxX = Math.max(0, Math.max.apply(null, xs));
        if (kind === 'scatter' || kind === 'bars') { var xGap = (maxX - minX || 1) * 0.12; minX -= xGap; maxX += xGap; }
        return [minX, maxX, Math.floor((lo - gap) / step) * step, Math.ceil((hi + gap) / step) * step];
    }

    function dataPlotState(item, rows, kind, width, height) {
        var metrics = getMetrics(item, getDefinition(item.type));
        var w = width || metrics.width; var h = height || metrics.height;
        var computed = dataDomain(rows, kind); var domain = item.params && item.params.dataDomain;
        var dataMinX = Math.min.apply(null, rows.map(function (row) { return row[0]; }));
        var dataMaxX = Math.max.apply(null, rows.map(function (row) { return row[0]; }));
        if (!Array.isArray(domain) || domain.length !== 4 || domain.some(function (v) { return !Number.isFinite(v) || Math.abs(v) > 10000000; }) || domain[0] > Math.min(0, dataMinX) || domain[1] < Math.max(0, dataMaxX) || domain[1] <= domain[0] || domain[3] <= domain[2] || domain[2] > 0 || domain[3] < 0 || rows.some(function (r) { var dy = kind === 'measurement' ? r[2] : 0; return r[1] - dy < domain[2] || r[1] + dy > domain[3]; })) domain = computed;
        var area = { left: -w / 2 + 42, right: w / 2 - 15, top: -h / 2 + 19, bottom: h / 2 - 27 };
        var mapX = function (x) { return area.left + (x - domain[0]) / (domain[1] - domain[0]) * (area.right - area.left); };
        var mapY = function (y) { return area.bottom - (y - domain[2]) / (domain[3] - domain[2]) * (area.bottom - area.top); };
        var timeTicks = Array.from(new Set([0].concat(rows.map(function (r) { return r[0]; }))));
        return { area: area, domain: domain.slice(), x: mapX, y: mapY, xTicks: kind === 'time' && timeTicks.length <= 8 ? timeTicks : dataTicks(domain[0], domain[1], 5), valueY: function (y) { return domain[2] + (area.bottom - y) / (area.bottom - area.top) * (domain[3] - domain[2]); } };
    }

    function shortNumber(value) {
        if (value === 0) return '0';
        if (Math.abs(value) >= 10000 || Math.abs(value) < 0.001) return value.toExponential(1).replace('.0e', 'e');
        return Number(value.toPrecision(3)).toString();
    }

    function drawDataAxes(ctx, item, state, xLabel, yLabel) {
        var a = state.area; var d = state.domain; var zero = state.y(0); var zeroX = state.x(0);
        arrow(ctx, a.left, zero, a.right + 4, zero, 5);
        arrow(ctx, zeroX, a.bottom, zeroX, a.top - 4, 5);
        write(ctx, xLabel, a.right, a.bottom + 21, item, 11, 'right');
        write(ctx, yLabel, zeroX, a.top - 12, item, 11, zeroX > (a.left + a.right) / 2 ? 'right' : 'left');
        dataTicks(d[2], d[3], Math.min(6, Math.max(2, Math.floor((a.bottom - a.top) / 19)))).forEach(function (v) { var y = state.y(v); strokePath(ctx, [[zeroX - 3, y], [zeroX, y]]); write(ctx, shortNumber(v), zeroX - 5, y, item, 10, 'right'); });
        var lastLabelRight = -Infinity;
        state.xTicks.forEach(function (v) { var x = state.x(v); var label = shortNumber(v); var halfWidth = label.length * 3; strokePath(ctx, [[x, zero - 3], [x, zero + 3]]); if (x - halfWidth >= lastLabelRight + 3) { write(ctx, label, x, zero + 12, item, 10); lastLabelRight = x + halfWidth; } });
    }

    function getDataEditor(item) {
        var definition = getDefinition(item.type); var editor = definition && definition.dataEditor;
        if (!editor) return null;
        return { columns: editor.columns.slice(), hint: editor.hint, text: editor.rows(item).map(function (row) { return row.join(', '); }).join('\n') };
    }

    function applyDataText(item, value) {
        var definition = getDefinition(item.type); var editor = definition && definition.dataEditor;
        if (!editor) return { ok: false, error: '這個素材沒有資料編輯功能。' };
        if (String(value).length > 12000) return { ok: false, error: '資料文字過長，請保留最多 32 筆。' };
        var lines = String(value).trim().split(/\r?\n/).filter(function (line) { return line.trim(); });
        var rows = [];
        for (var i = 0; i < lines.length; i += 1) {
            var cells = lines[i].trim().replace(/，/g, ',').split(/[,;\t]/).map(function (s) { return s.trim(); });
            if (cells.length === 1) cells = lines[i].trim().split(/\s+/);
            if (i === 0 && cells.join(',').toLowerCase() === editor.columns.join(',').toLowerCase()) continue;
            if (cells.some(function (cell) { return !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(cell); })) return { ok: false, error: '第 ' + (i + 1) + ' 行有空欄或非數字；請按 ' + editor.columns.join(', ') + ' 輸入。' };
            rows.push(cells.map(Number));
        }
        var error = validateDataRows(rows, editor.kind);
        if (error) return { ok: false, error: error };
        editor.apply(item, rows);
        return { ok: true, count: rows.length };
    }

    function timeDataRows(item) {
        var p = paramsFor(item, item.type);
        if (p.dataPoints && p.dataPoints.length) return p.dataPoints.map(function (r) { return r.slice(); });
        return item.type === 'velocityTimeGraph' ? [[0, p.start], [p.kneeTime * 10, p.knee], [10, p.end]] : [[0, p.start], [10, p.end]];
    }

    function timeDataEditor(yLabel) {
        return { columns: ['t', yLabel], kind: 'time', hint: '每行為時間 t（s）、' + (yLabel === 'v' ? '速度 v（m/s）' : '加速度 a（m/s²）') + '。可貼上試算表兩欄；同一時間兩點可表示跳變。套用後顯示真實數值刻度，藍點上下調值，時間由表格設定。', rows: timeDataRows,
            apply: function (item, rows) { item.params = sanitizeParams(item.type, Object.assign({}, item.params, { dataMode: 1, dataPoints: rows, dataDomain: dataDomain(rows, 'time') })); } };
    }

    function signedTimeParametric(type, defaults, includeKnee) {
        var constant = type === 'constantVelocityGraph';
        var controls = [
            parameter('start', constant ? '速度值' : '初值', -1, 1, 0.05, ''),
            parameter('end', '末值', -1, 1, 0.05, '')
        ];
        if (constant) controls.pop();
        if (includeKnee) {
            controls.splice(1, 0, parameter('knee', '轉折值', -1, 1, 0.05, ''));
            controls.push(parameter('kneeTime', '轉折時間位置', 0.12, 0.82, 0.02, ''));
        }
        if (!constant) {
            defaults = Object.assign({}, defaults, { dataMode: 0, dataPoints: [], dataDomain: null });
            controls.unshift({ key: 'dataMode', label: '資料來源', min: 0, max: 1, step: 1, kind: 'select', choices: [{ value: 0, label: '簡易示意（原有參數）' }, { value: 1, label: '自訂多段資料' }] });
        }
        return makeParametric(defaults, controls, {
            getControls: function (item) { return !constant && item && paramsFor(item, type).dataMode ? [controls[0]] : controls; },
            sanitize: function (source) {
                var p = sanitizedByControls(defaults, controls, source);
                if (constant) p.end = p.start;
                else {
                    p.dataPoints = source && !validateDataRows(source.dataPoints, 'time') ? source.dataPoints.map(function (r) { return r.slice(); }) : [];
                    p.dataDomain = source && Array.isArray(source.dataDomain) ? source.dataDomain.slice(0, 4) : null;
                    if (p.dataMode && !p.dataPoints.length) p.dataPoints = includeKnee ? [[0, p.start], [p.kneeTime * 10, p.knee], [10, p.end]] : [[0, p.start], [10, p.end]];
                }
                return p;
            },
            bounds: function (item) { var area = graphArea(item); return simpleBounds(area.width, area.height, 4); },
            handles: function (item) {
                var p = paramsFor(item, type); var raw = graphArea(item); var area = { left: raw.left, right: raw.right, top: raw.top, bottom: raw.bottom, zero: (raw.top + raw.bottom) / 2 };
                if (p.dataMode) {
                    var state = dataPlotState(item, p.dataPoints, 'time');
                    return p.dataPoints.map(function (r, i) { return { id: 'data-' + i, label: '點 ' + (i + 1), x: state.x(r[0]), y: state.y(r[1]), readout: 't ' + r[0] + ' · ' + r[1], primary: i === 0 }; });
                }
                if (constant) {
                    var middle = signedGraphPoint(area, 0.47, p.start);
                    return [{ id: 'start', label: '速度值', x: middle.x, y: middle.y, primary: true }];
                }
                var handles = [{ id: 'start', label: '初值', x: signedGraphPoint(area, 0, p.start).x, y: signedGraphPoint(area, 0, p.start).y }];
                if (includeKnee) { var knee = signedGraphPoint(area, p.kneeTime, p.knee); handles.push({ id: 'knee', label: '轉折點', x: knee.x, y: knee.y, primary: true }); }
                var end = signedGraphPoint(area, 0.94, p.end); handles.push({ id: 'end', label: '末值', x: end.x, y: end.y, primary: !includeKnee });
                return handles;
            },
            update: function (item, id, localPoint) {
                if (id.indexOf('data-') === 0) {
                    var custom = paramsFor(item, type); var index = Number(id.slice(5));
                    if (!custom.dataMode || !custom.dataPoints[index]) return null;
                    var plot = dataPlotState(item, custom.dataPoints, 'time');
                    custom.dataDomain = plot.domain;
                    custom.dataPoints[index][1] = Number(clampNumber(plot.valueY(localPoint.y), Math.max(-1000000, plot.domain[2]), Math.min(1000000, plot.domain[3]), custom.dataPoints[index][1]).toPrecision(10));
                    item.params = sanitizeParams(type, custom);
                    return { readout: 't ' + custom.dataPoints[index][0] + ' · ' + custom.dataPoints[index][1] };
                }
                if (id !== 'start' && id !== 'knee' && id !== 'end') return null;
                var p = paramsFor(item, type); var area = graphArea(item); var zero = (area.top + area.bottom) / 2; var halfHeight = (area.bottom - area.top) / 2;
                var key = constant ? 'start' : id;
                p[key] = clampNumber((zero - localPoint.y) / (halfHeight * 0.88), -1, 1, p[key]);
                if (id === 'knee') p.kneeTime = clampNumber((localPoint.x - area.left) / (area.right - area.left), 0.12, 0.82, p.kneeTime);
                item.params = definitions[type].parametric.sanitize(p);
                return { readout: (id === 'knee' ? 't ' + item.params.kneeTime + ' · ' : '') + item.params[key] };
            }
        });
    }

    var velocityTimeParametric = signedTimeParametric('velocityTimeGraph', { start: 0.15, knee: 0.82, end: 0.82, kneeTime: 0.42 }, true);
    var constantVelocityParametric = signedTimeParametric('constantVelocityGraph', { start: 0.62, end: 0.62 }, false);
    var positionTimeParametric = graphSeriesParametric(
        'positionTimeGraph',
        [{ key: 'start', x: 0, y: 0.05 }, { key: 'control', x: 0.36, y: 0.08 }, { key: 'end', x: 0.95, y: 0.95 }],
        ['初位置', '曲線控制點', '末位置']
    );
    var positionSourceControl = { key: 'dataMode', label: '資料來源', min: 0, max: 1, step: 1, kind: 'select', choices: [{ value: 0, label: '原有曲線示意' }, { value: 1, label: '自訂多段位置' }] };
    var positionSampleRows = [[0, 0], [2, 4], [4, 4], [7, -2]];
    positionTimeParametric.defaults = Object.assign({}, positionTimeParametric.defaults, { dataMode: 0, dataPoints: [], dataDomain: null });
    var positionLegacyControls = positionTimeParametric.controls.slice();
    positionTimeParametric.controls = [positionSourceControl].concat(positionLegacyControls);
    var positionLegacySanitize = positionTimeParametric.sanitize;
    var positionLegacyHandles = positionTimeParametric.handles;
    var positionLegacyUpdate = positionTimeParametric.update;
    positionTimeParametric.sanitize = function (source) {
        var p = positionLegacySanitize(source);
        p.dataMode = Math.round(clampNumber(source.dataMode, 0, 1, 0));
        p.dataPoints = !validateDataRows(source.dataPoints, 'position') ? source.dataPoints.map(function (r) { return r.slice(); }) : [];
        if (p.dataMode && !p.dataPoints.length) p.dataPoints = positionSampleRows.map(function (r) { return r.slice(); });
        p.dataDomain = Array.isArray(source.dataDomain) ? source.dataDomain.slice(0, 4) : null;
        return p;
    };
    positionTimeParametric.getControls = function (item) { return paramsFor(item, 'positionTimeGraph').dataMode ? [positionSourceControl] : positionTimeParametric.controls; };
    positionTimeParametric.handles = function (item) {
        var p = paramsFor(item, 'positionTimeGraph');
        if (!p.dataMode) return positionLegacyHandles(item);
        var s = dataPlotState(item, p.dataPoints, 'time');
        return p.dataPoints.map(function (r, i) { return { id: 'data-' + i, label: '位置 ' + (i + 1), x: s.x(r[0]), y: s.y(r[1]), primary: i === 0, readout: 't=' + r[0] + ' s · x=' + r[1] + ' m' }; });
    };
    positionTimeParametric.update = function (item, id, point) {
        if (id.indexOf('data-') !== 0) return positionLegacyUpdate(item, id, point);
        var p = paramsFor(item, 'positionTimeGraph'); var index = Number(id.slice(5));
        if (!p.dataMode || !p.dataPoints[index]) return null;
        var s = dataPlotState(item, p.dataPoints, 'time'); p.dataDomain = s.domain;
        p.dataPoints[index][1] = Number(clampNumber(s.valueY(point.y), Math.max(-1000000, s.domain[2]), Math.min(1000000, s.domain[3]), p.dataPoints[index][1]).toPrecision(10));
        item.params = sanitizeParams(item.type, p); return { readout: 'x=' + item.params.dataPoints[index][1] + ' m' };
    };
    var accelerationTimeParametric = signedTimeParametric('accelerationTimeGraph', { start: 0.58, end: 0.58 }, false);
    var barGraphParametric = graphSeriesParametric(
        'barGraph',
        [
            { key: 'b1', x: 0.16, y: 0.35 }, { key: 'b2', x: 0.36, y: 0.60 },
            { key: 'b3', x: 0.56, y: 0.46 }, { key: 'b4', x: 0.76, y: 0.78 }
        ],
        ['長條 1', '長條 2', '長條 3', '長條 4']
    );

    function flexibleSeriesRows(type, p) {
        if (p.dataPoints && p.dataPoints.length) return p.dataPoints.map(function (r) { return r.slice(); });
        return type === 'pointGraph'
            ? [0.12, 0.28, 0.43, 0.58, 0.72, 0.87].map(function (x, i) { return [x, p['p' + (i + 1)]]; })
            : [1, 2, 3, 4].map(function (x) { return [x, p['b' + x]]; });
    }
    function flexibleSeriesEditor(type) {
        var kind = type === 'pointGraph' ? 'scatter' : 'bars';
        return { columns: ['x', 'y'], kind: kind, hint: kind === 'scatter' ? '每行一點：x、y。可增刪至 1～32 點，也可貼上兩欄資料。' : '每行一根長條：x（類別編號）、y（數值）。支援 1～32 根與負值。',
            rows: function (item) { return flexibleSeriesRows(type, paramsFor(item, type)); },
            apply: function (item, rows) { item.params = sanitizeParams(type, Object.assign({}, item.params, { dataMode: 1, dataPoints: rows, dataDomain: dataDomain(rows, kind) })); }
        };
    }
    function extendFlexibleSeries(type, config) {
        var legacySanitize = config.sanitize; var legacyHandles = config.handles; var legacyUpdate = config.update;
        var sourceControl = { key: 'dataMode', label: '資料來源', min: 0, max: 1, step: 1, kind: 'select', choices: [{ value: 0, label: '簡易示意' }, { value: 1, label: '自訂資料（可增刪）' }] };
        var kind = type === 'pointGraph' ? 'scatter' : 'bars';
        config.defaults = Object.assign({}, config.defaults, { dataMode: 0, dataPoints: [], dataDomain: null });
        config.controls = [sourceControl].concat(config.controls);
        config.getControls = function (item) { return paramsFor(item, type).dataMode ? [sourceControl] : config.controls; };
        config.sanitize = function (source) {
            var p = legacySanitize(source); p.dataMode = source.dataMode === 1 ? 1 : 0;
            p.dataPoints = !validateDataRows(source.dataPoints, kind) ? source.dataPoints.map(function (r) { return r.slice(); }) : [];
            if (p.dataMode && !p.dataPoints.length) p.dataPoints = flexibleSeriesRows(type, p);
            p.dataDomain = Array.isArray(source.dataDomain) ? source.dataDomain.slice(0, 4) : null;
            return p;
        };
        config.handles = function (item) {
            var p = paramsFor(item, type); if (!p.dataMode) return legacyHandles(item);
            var s = dataPlotState(item, p.dataPoints, kind);
            return p.dataPoints.map(function (r, i) { return { id: 'data-' + i, label: (kind === 'scatter' ? '點 ' : '長條 ') + (i + 1), x: s.x(r[0]), y: s.y(r[1]), primary: i === 0, readout: r.join(', ') }; });
        };
        config.update = function (item, id, point) {
            var p = paramsFor(item, type); if (!p.dataMode) return legacyUpdate(item, id, point);
            if (!/^data-\d+$/.test(id) || !p.dataPoints[Number(id.slice(5))]) return null;
            var row = p.dataPoints[Number(id.slice(5))]; var s = dataPlotState(item, p.dataPoints, kind); p.dataDomain = s.domain;
            if (kind === 'scatter') row[0] = Number(clampNumber(s.domain[0] + (point.x - s.area.left) / (s.area.right - s.area.left) * (s.domain[1] - s.domain[0]), Math.max(-1000000, s.domain[0]), Math.min(1000000, s.domain[1]), row[0]).toPrecision(10));
            row[1] = Number(clampNumber(s.valueY(point.y), Math.max(-1000000, s.domain[2]), Math.min(1000000, s.domain[3]), row[1]).toPrecision(10));
            item.params = sanitizeParams(type, p); return { readout: row.join(', ') };
        };
    }
    extendFlexibleSeries('pointGraph', pointGraphParametric);
    extendFlexibleSeries('barGraph', barGraphParametric);

    /* General annotation assets. */
    add('general', 'text', '文字', 110, 36, function (ctx, item) {
        write(ctx, Object.prototype.hasOwnProperty.call(item, 'label') ? item.label : '文字', 0, 0, item, 22);
    }, { defaultLabel: '文字', measure: textMeasure, suppressCommonLabel: true, keywords: ['文字', '說明', '標註'] });

    add('general', 'label', '標籤', 100, 38, function (ctx, item, options, metrics) {
        var value = Object.prototype.hasOwnProperty.call(item, 'label') ? item.label : '標籤';
        write(ctx, value, 0, -4, item, 18);
        strokePath(ctx, [[-metrics.width / 2 + 10, 11], [metrics.width / 2 - 10, 11]]);
    }, { defaultLabel: '標籤', measure: labelMeasure, suppressCommonLabel: true, keywords: ['標籤', '名稱'] });

    add('general', 'line', '直線', 120, 20, function (ctx, item, options, metrics) {
        strokePath(ctx, [[-metrics.width / 2, 0], [metrics.width / 2, 0]]);
    }, { measure: lineMeasure, keywords: ['線段', '連線'] });

    add('general', 'dashedLine', '虛線', 120, 20, function (ctx, item, options, metrics) {
        ctx.setLineDash([10, 7]);
        strokePath(ctx, [[-metrics.width / 2, 0], [metrics.width / 2, 0]]);
        ctx.setLineDash([]);
    }, { measure: lineMeasure, keywords: ['虛線', '輔助線'] });

    add('general', 'arrow', '箭頭', 110, 44, function (ctx, item, options, metrics) {
        arrow(ctx, -metrics.width / 2, 0, metrics.width / 2, 0, 11, false);
    }, { measure: arrowMeasure, keywords: ['箭頭', '方向'] });

    add('general', 'doubleArrow', '雙向箭頭', 110, 44, function (ctx, item, options, metrics) {
        arrow(ctx, -metrics.width / 2, 0, metrics.width / 2, 0, 11, true);
    }, { measure: arrowMeasure, keywords: ['雙向', '範圍'] });

    add('general', 'angleArc', '角度弧', 90, 90, function (ctx, item) {
        var state = angleArcState(item);
        var degrees = state.params.angle;
        var radians = -degrees * DEG;
        strokePath(ctx, [[0, 0], [state.params.radius, 0]]);
        strokePath(ctx, [[0, 0], [state.end.x, state.end.y]]);
        begin(ctx);
        ctx.arc(0, 0, state.params.radius * 0.64, Math.min(0, radians), Math.max(0, radians));
        ctx.stroke();
        var middle = radians / 2;
        var labelRadius = state.params.radius * 0.86;
        write(ctx, Object.prototype.hasOwnProperty.call(item, 'label') && item.label ? item.label : String(Math.round(degrees)) + '°', Math.cos(middle) * labelRadius, Math.sin(middle) * labelRadius, item, 14);
    }, { suppressCommonLabel: true, keywords: ['角度', '弧'], parametric: angleArcParametric });

    add('general', 'dimensionLine', '尺寸線', 120, 42, function (ctx, item, options, metrics) {
        var half = metrics.width / 2;
        arrow(ctx, -half, 0, half, 0, 9, true);
        strokePath(ctx, [[-half, -12], [-half, 12]]);
        strokePath(ctx, [[half, -12], [half, 12]]);
    }, { measure: arrowMeasure, defaultLabel: 'L', labelPosition: { x: 0, y: -15 }, keywords: ['距離', '長度'] });

    add('general', 'point', '標記點', 32, 32, function (ctx) {
        dot(ctx, 0, 0, 5);
    }, { defaultLabel: 'P', labelPosition: { x: 13, y: -12 }, keywords: ['點', '位置'] });

    add('general', 'groundLine', '地面線', 120, 34, function (ctx, item, options, metrics) {
        var half = metrics.width / 2;
        strokePath(ctx, [[-half, -6], [half, -6]]);
        hatchLine(ctx, -half, -6, half - 7, -6, 13, 12);
    }, { measure: lineMeasure, keywords: ['地面', '基準'] });

    /* Mechanics assets. */
    add('mechanics', 'forceArrow', '力箭頭', 110, 44, function (ctx, item, options, metrics) {
        arrow(ctx, -metrics.width / 2, 0, metrics.width / 2, 0, 12, false);
    }, { measure: arrowMeasure, defaultLabel: 'F', labelPosition: { x: 0, y: -16 }, keywords: ['力', '向量', '受力圖'] });

    add('mechanics', 'velocityArrow', '速度箭頭', 110, 44, function (ctx, item, options, metrics) {
        arrow(ctx, -metrics.width / 2, 0, metrics.width / 2, 0, 11, false);
    }, { measure: arrowMeasure, defaultLabel: 'v', labelPosition: { x: 0, y: -16 }, keywords: ['速度', '向量'] });

    add('mechanics', 'accelerationArrow', '加速度箭頭', 110, 44, function (ctx, item, options, metrics) {
        arrow(ctx, -metrics.width / 2, 0, metrics.width / 2, 0, 11, false);
    }, { measure: arrowMeasure, defaultLabel: 'a', labelPosition: { x: 0, y: -16 }, keywords: ['加速度', '向量'] });

    add('mechanics', 'block', '木塊', 76, 58, function (ctx, item, options, metrics) {
        ctx.fillRect(-metrics.width / 2, -metrics.height / 2, metrics.width, metrics.height);
        ctx.strokeRect(-metrics.width / 2, -metrics.height / 2, metrics.width, metrics.height);
    }, { defaultLabel: 'm', labelPosition: { x: 0, y: 0 }, keywords: ['木塊', '質量'] });

    add('mechanics', 'ramp', '斜面', 150, 90, function (ctx, item, options, metrics) {
        var state = rampState(item);
        path(ctx, [[state.left.x, state.left.y], [state.right.x, state.right.y], [state.top.x, state.top.y]], true);
        ctx.fill();
        ctx.stroke();
        hatchLine(ctx, state.left.x, state.left.y, state.right.x, state.right.y, 15, 10);
    }, { keywords: ['斜面', '斜坡'], parametric: rampParametric });

    add('mechanics', 'ball', '小球', 58, 58, function (ctx) {
        circle(ctx, 0, 0, 25, true);
    }, { defaultLabel: 'm', labelPosition: { x: 0, y: 0 }, keywords: ['球', '圓球'] });

    add('mechanics', 'pulley', '定滑輪', 78, 96, function (ctx, item) {
        var p = paramsFor(item, 'pulley');
        strokePath(ctx, [[-p.radius * 0.8, -p.radius - 18], [p.radius * 0.8, -p.radius - 18], [0, -p.radius + 4], [0, -p.radius - 8]]);
        circle(ctx, 0, 0, p.radius, true);
        circle(ctx, 0, 0, Math.max(3, p.radius * 0.14), true);
        strokePath(ctx, [[-p.radius, 0], [-p.radius, p.leftRope]]);
        strokePath(ctx, [[p.radius, 0], [p.radius, p.rightRope]]);
        write(ctx, item.label, 0, 1, item, 14);
    }, { suppressCommonLabel: true, keywords: ['滑輪', '定滑輪'], parametric: fixedPulleyParametric });

    add('mechanics', 'movablePulley', '動滑輪', 78, 100, function (ctx) {
        var item = arguments[1];
        var p = paramsFor(item, 'movablePulley');
        strokePath(ctx, [[-p.radius, -p.leftRope], [-p.radius, 0]]);
        strokePath(ctx, [[p.radius, -p.rightRope], [p.radius, 0]]);
        circle(ctx, 0, 0, p.radius, true);
        circle(ctx, 0, 0, Math.max(3, p.radius * 0.14), true);
        strokePath(ctx, [[0, p.radius], [0, p.radius + 20]]);
    }, { keywords: ['滑輪', '動滑輪'], parametric: movablePulleyParametric });

    add('mechanics', 'spring', '彈簧', 130, 44, function (ctx, item, options, metrics) {
        var p = paramsFor(item, 'spring');
        var points = [[p.startX, 0], [p.startX + 14, 0]];
        var coils = p.coils;
        var usable = p.length - 28;
        for (var i = 0; i <= coils; i += 1) {
            points.push([p.startX + 14 + usable * i / coils, i === 0 || i === coils ? 0 : (i % 2 ? -p.amplitude : p.amplitude)]);
        }
        points.push([p.startX + p.length, 0]);
        strokePath(ctx, points);
    }, { defaultLabel: 'k', labelPosition: function (item) { var p = paramsFor(item, 'spring'); return { x: p.startX + p.length / 2, y: -p.amplitude - 12 }; }, keywords: ['彈簧', '虎克定律'], modelNote: '純幾何彈簧符號；顯示長度不是自然長度或伸長量。拖任一端時另一端固定；數字長度欄固定左端。半寬控制點貼在線圈頂點，鋸齒段數只調示意密度，不代表實際完整匝數。縮短時若過密會減少鋸齒段數，避免列印成黑塊。', parametric: springParametric });

    add('mechanics', 'pendulum', '單擺', 100, 150, function (ctx, item) {
        var state = pendulumState(item);
        strokePath(ctx, [[-34, state.pivot.y], [34, state.pivot.y]]);
        hatchLine(ctx, -34, state.pivot.y, 34, state.pivot.y, 10, -8);
        strokePath(ctx, [[state.pivot.x, state.pivot.y], [state.bob.x, state.bob.y]]);
        circle(ctx, state.bob.x, state.bob.y, state.params.bobRadius, true);
    }, { keywords: ['單擺', '擺錘'], labelPosition: function (item) { return pendulumState(item).bob; }, parametric: pendulumParametric });

    add('mechanics', 'cart', '小車', 116, 72, function (ctx, item, options, metrics) {
        ctx.fillRect(-metrics.width / 2 + 8, -metrics.height / 2 + 8, metrics.width - 16, 35);
        ctx.strokeRect(-metrics.width / 2 + 8, -metrics.height / 2 + 8, metrics.width - 16, 35);
        circle(ctx, -metrics.width / 2 + 28, metrics.height / 2 - 12, 10, true);
        circle(ctx, metrics.width / 2 - 28, metrics.height / 2 - 12, 10, true);
    }, { defaultLabel: 'm', labelPosition: { x: 0, y: -10 }, keywords: ['小車', '台車'] });

    add('mechanics', 'surface', '粗糙表面', 150, 38, function (ctx, item, options, metrics) {
        var half = metrics.width / 2;
        strokePath(ctx, [[-half, -7], [half, -7]]);
        hatchLine(ctx, -half, -7, half - 8, -7, 12, 13);
    }, { measure: lineMeasure, keywords: ['粗糙面', '摩擦'] });

    add('mechanics', 'rope', '繩子', 120, 20, function (ctx, item, options, metrics) {
        strokePath(ctx, [[-metrics.width / 2, 0], [metrics.width / 2, 0]]);
    }, { measure: wireMeasure, keywords: ['繩', '張力'] });

    add('mechanics', 'hangingMass', '懸掛砝碼', 64, 116, function (ctx, item, options, metrics) {
        var p = paramsFor(item, 'hangingMass');
        strokePath(ctx, [[0, -p.ropeLength], [0, 0]]);
        ctx.fillRect(-p.massWidth / 2, 0, p.massWidth, p.massHeight);
        ctx.strokeRect(-p.massWidth / 2, 0, p.massWidth, p.massHeight);
    }, { defaultLabel: 'm', labelPosition: function (item) { return { x: 0, y: paramsFor(item, 'hangingMass').massHeight / 2 }; }, keywords: ['砝碼', '懸掛'], parametric: hangingMassParametric });

    add('mechanics', 'fulcrum', '支點', 64, 56, function (ctx) {
        path(ctx, [[0, -22], [-25, 22], [25, 22]], true);
        ctx.fill();
        ctx.stroke();
        strokePath(ctx, [[-31, 25], [31, 25]]);
    }, { keywords: ['支點', '槓桿'] });

    add('mechanics', 'lever', '槓桿', 150, 60, function (ctx, item) {
        var state = leverState(item);
        strokePath(ctx, [[state.left.x, state.left.y], [state.right.x, state.right.y]]);
        path(ctx, [[0, 0], [-18, 30], [18, 30]], true);
        ctx.fill();
        ctx.stroke();
    }, { keywords: ['槓桿', '力矩'], parametric: leverParametric });

    add('mechanics', 'projectilePath', '拋體軌跡', 180, 110, function (ctx, item) {
        var state = projectileState(item);
        ctx.setLineDash([7, 6]);
        begin(ctx);
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(
            state.control.x,
            state.control.y,
            state.landing.x,
            state.landing.y
        );
        ctx.stroke();
        ctx.setLineDash([]);
        if (state.params.showVelocity) arrow(ctx, 0, 0, state.velocityTip.x, state.velocityTip.y, 8, false);
        dot(ctx, 0, 0, 3.5);
    }, { keywords: ['拋體', '軌跡', '初射角'], parametric: projectileParametric });

    /* Circuit assets. */
    add('circuit', 'wire', '導線', 120, 20, function (ctx, item, options, metrics) {
        strokePath(ctx, [[-metrics.width / 2, 0], [metrics.width / 2, 0]]);
    }, { measure: wireMeasure, keywords: ['導線', '接線'] });

    add('circuit', 'junction', '接點', 70, 32, function (ctx, item, options, metrics) {
        var p = paramsFor(item, 'junction');
        strokePath(ctx, [[-p.span / 2, 0], [p.span / 2, 0]]);
        strokePath(ctx, [[0, 0], [0, -p.branch]]);
        dot(ctx, 0, 0, 5);
    }, { keywords: ['接點', '節點'], parametric: junctionParametric });

    add('circuit', 'cell', '電池單體', 100, 58, function (ctx, item) {
        var p = paramsFor(item, 'cell');
        terminals(ctx, p.span / 2, -9, 9);
        strokePath(ctx, [[-9, -12], [-9, 12]]);
        strokePath(ctx, [[9, -22], [9, 22]]);
        write(ctx, '−', -14, -19, null, 13);
        write(ctx, '+', 14, -25, null, 13);
    }, { keywords: ['電池', '電池單體'], parametric: terminalParametrics.cell });

    add('circuit', 'battery', '電池組', 120, 70, function (ctx) {
        var item = arguments[1];
        var p = paramsFor(item, 'battery');
        var half = p.span / 2;
        var plateCount = p.cells * 2;
        var plateSpan = Math.min(p.span - 34, plateCount * 18);
        var positions = [];
        for (var positionIndex = 0; positionIndex < plateCount; positionIndex += 1) {
            positions.push(-plateSpan / 2 + plateSpan * positionIndex / Math.max(1, plateCount - 1));
        }
        terminals(ctx, half, positions[0], positions[positions.length - 1]);
        for (var i = 0; i < positions.length; i += 1) {
            var tall = i % 2 === 1;
            strokePath(ctx, [[positions[i], tall ? -25 : -13], [positions[i], tall ? 25 : 13]]);
        }
        write(ctx, '−', positions[0] - 8, -22, null, 13);
        write(ctx, '+', positions[positions.length - 1] + 8, -29, null, 13);
    }, { defaultLabel: 'ε', labelPosition: { x: 0, y: 31 }, keywords: ['電池組', '電源'], parametric: batteryParametric });

    add('circuit', 'resistor', '電阻（IEC矩形）', 120, 54, function (ctx, item) {
        var p = paramsFor(item, 'resistor');
        terminals(ctx, p.span / 2, -34, 34);
        ctx.fillRect(-34, -13, 68, 26);
        ctx.strokeRect(-34, -13, 68, 26);
    }, { defaultLabel: 'R', labelPosition: { x: 0, y: -21 }, keywords: ['電阻', 'IEC', '矩形電阻'], parametric: terminalParametrics.resistor });

    add('circuit', 'resistorTaiwan', '電阻（台灣高中）', 120, 54, function (ctx, item) {
        var p = paramsFor(item, 'resistorTaiwan');
        terminals(ctx, p.span / 2, -34, 34);
        zigzagResistor(ctx, -34, 34, 11, 8);
    }, { defaultLabel: 'R', labelPosition: { x: 0, y: -21 }, keywords: ['電阻', '台灣高中', '鋸齒電阻'], parametric: terminalParametrics.resistorTaiwan });

    add('circuit', 'variableResistor', '可變電阻（IEC矩形）', 120, 70, function (ctx) {
        var item = arguments[1];
        var p = paramsFor(item, 'variableResistor');
        terminals(ctx, p.span / 2, -34, 34);
        ctx.fillRect(-34, -13, 68, 26);
        ctx.strokeRect(-34, -13, 68, 26);
        arrow(ctx, -30, 38, 30, -38, 8, false);
    }, { defaultLabel: 'R', labelPosition: { x: 0, y: 30 }, keywords: ['可變電阻', '滑動變阻器', 'IEC', '矩形電阻'], parametric: variableResistorParametric });

    add('circuit', 'variableResistorTaiwan', '可變電阻（台灣高中）', 120, 70, function (ctx) {
        var item = arguments[1];
        var p = paramsFor(item, 'variableResistorTaiwan');
        terminals(ctx, p.span / 2, -34, 34);
        zigzagResistor(ctx, -34, 34, 11, 8);
        arrow(ctx, -30, 38, 30, -38, 8, false);
    }, { defaultLabel: 'R', labelPosition: { x: 0, y: 30 }, keywords: ['可變電阻', '滑動變阻器', '台灣高中', '鋸齒電阻'], parametric: variableResistorTaiwanParametric });

    add('circuit', 'lamp', '燈泡', 112, 64, function (ctx, item) {
        var p = paramsFor(item, 'lamp');
        terminals(ctx, p.span / 2, -28, 28);
        circle(ctx, 0, 0, 28, true);
        strokePath(ctx, [[-18, -18], [18, 18]]);
        strokePath(ctx, [[-18, 18], [18, -18]]);
    }, { defaultLabel: 'L', labelPosition: { x: 0, y: 38 }, keywords: ['燈泡', '電燈'], parametric: terminalParametrics.lamp });

    add('circuit', 'switchOpen', '開路開關', 120, 58, function (ctx) {
        var item = arguments[1];
        var p = paramsFor(item, 'switchOpen');
        var left = -p.gap / 2;
        var right = p.gap / 2;
        var length = p.gap - 8;
        var radians = -p.angle * DEG;
        strokePath(ctx, [[-p.gap / 2 - 35, 0], [left, 0]]);
        strokePath(ctx, [[right, 0], [p.gap / 2 + 35, 0]]);
        circle(ctx, left, 0, 4, true);
        circle(ctx, right, 0, 4, true);
        strokePath(ctx, [[left + 4, 0], [left + 4 + Math.cos(radians) * length, Math.sin(radians) * length]]);
    }, { keywords: ['開關', '斷開', '開路'], parametric: switchOpenParametric });

    add('circuit', 'switchClosed', '閉合開關', 120, 58, function (ctx) {
        var item = arguments[1];
        var p = paramsFor(item, 'switchClosed');
        var left = -p.gap / 2;
        var right = p.gap / 2;
        var length = p.gap - 8;
        var radians = -p.angle * DEG;
        strokePath(ctx, [[-p.gap / 2 - 35, 0], [left, 0]]);
        strokePath(ctx, [[right, 0], [p.gap / 2 + 35, 0]]);
        circle(ctx, left, 0, 4, true);
        circle(ctx, right, 0, 4, true);
        strokePath(ctx, [[left + 4, 0], [left + 4 + Math.cos(radians) * length, Math.sin(radians) * length]]);
    }, { keywords: ['開關', '閉合', '通路'], parametric: switchClosedParametric });

    function meterRenderer(letter, type) {
        return function (ctx, item) {
            var p = paramsFor(item, type);
            terminals(ctx, p.span / 2, -27, 27);
            circle(ctx, 0, 0, 27, true);
            write(ctx, letter, 0, 1, item, 22);
        };
    }

    add('circuit', 'ammeter', '安培計', 116, 62, meterRenderer('A', 'ammeter'), { keywords: ['安培計', '電流計'], parametric: terminalParametrics.ammeter });
    add('circuit', 'voltmeter', '伏特計', 116, 62, meterRenderer('V', 'voltmeter'), { keywords: ['伏特計', '電壓計'], parametric: terminalParametrics.voltmeter });
    add('circuit', 'galvanometer', '檢流計', 116, 62, meterRenderer('G', 'galvanometer'), { keywords: ['檢流計'], parametric: terminalParametrics.galvanometer });
    add('circuit', 'motor', '馬達', 116, 62, meterRenderer('M', 'motor'), { keywords: ['馬達', '電動機'], parametric: terminalParametrics.motor });

    add('circuit', 'capacitor', '電容器', 110, 62, function (ctx, item) {
        var p = paramsFor(item, 'capacitor');
        terminals(ctx, p.span / 2, -10, 10);
        strokePath(ctx, [[-10, -24], [-10, 24]]);
        strokePath(ctx, [[10, -24], [10, 24]]);
    }, { defaultLabel: 'C', labelPosition: { x: 0, y: 31 }, keywords: ['電容器', '電容'], parametric: terminalParametrics.capacitor });

    add('circuit', 'polarizedCapacitor', '有極性電容', 110, 70, function (ctx, item) {
        var p = paramsFor(item, 'polarizedCapacitor');
        terminals(ctx, p.span / 2, -10, 8);
        strokePath(ctx, [[-10, -24], [-10, 24]]);
        begin(ctx);
        ctx.arc(26, 0, 18, Math.PI * 0.58, Math.PI * 1.42);
        ctx.stroke();
        write(ctx, '+', -20, -27, item, 14);
    }, { defaultLabel: 'C', labelPosition: { x: 0, y: 33 }, keywords: ['電解電容', '有極性'], parametric: terminalParametrics.polarizedCapacitor });

    add('circuit', 'inductor', '電感線圈', 130, 58, function (ctx) {
        var item = arguments[1];
        var p = paramsFor(item, 'inductor');
        var halfSpan = p.span / 2;
        var halfTotal = Math.max(65, halfSpan + 23);
        terminals(ctx, halfTotal, -halfSpan, halfSpan);
        drawInductorWinding(ctx, p.span, p.coils, 0, 0);
        if (p.current) {
            var leadCenter = -(halfTotal + halfSpan) / 2;
            arrow(ctx, leadCenter - 7 * p.current, -3, leadCenter + 7 * p.current, -3, 5, false);
            write(ctx, 'I', leadCenter, -18, item, 13);
        }
        if (p.showTerminals) {
            circle(ctx, -halfTotal, 0, 3, true); circle(ctx, halfTotal, 0, 3, true);
            write(ctx, 'a', -halfTotal, -17, item, 13); write(ctx, 'b', halfTotal, -17, item, 13);
        }
    }, { defaultLabel: 'L', labelPosition: function (item) { return { x: 0, y: -inductorShape(paramsFor(item, 'inductor')).height - 18 }; }, keywords: ['電感', '線圈'], parametric: inductorParametric });

    add('circuit', 'diode', '二極體', 120, 60, function (ctx, item) {
        var p = paramsFor(item, 'diode');
        terminals(ctx, p.span / 2, -29, 18);
        path(ctx, [[-29, -21], [-29, 21], [18, 0]], true);
        ctx.fill();
        ctx.stroke();
        strokePath(ctx, [[18, -23], [18, 23]]);
    }, { defaultLabel: 'D', labelPosition: { x: 0, y: 31 }, keywords: ['二極體'], parametric: terminalParametrics.diode });

    add('circuit', 'led', '發光二極體', 120, 78, function (ctx, item) {
        var p = paramsFor(item, 'led');
        terminals(ctx, p.span / 2, -29, 18);
        path(ctx, [[-29, -17], [-29, 17], [18, 0]], true);
        ctx.fill();
        ctx.stroke();
        strokePath(ctx, [[18, -20], [18, 20]]);
        arrow(ctx, 6, -20, 28, -38, 6, false);
        arrow(ctx, 19, -13, 41, -31, 6, false);
    }, { defaultLabel: 'LED', labelPosition: { x: 0, y: 34 }, keywords: ['LED', '發光二極體'], parametric: terminalParametrics.led });

    add('circuit', 'fuse', '保險絲', 120, 48, function (ctx, item) {
        var p = paramsFor(item, 'fuse');
        terminals(ctx, p.span / 2, -32, 32);
        ctx.strokeRect(-32, -9, 64, 18);
        strokePath(ctx, [[-25, 0], [25, 0]]);
    }, { keywords: ['保險絲', '熔絲'], parametric: terminalParametrics.fuse });

    add('circuit', 'ground', '接地', 60, 72, function (ctx) {
        strokePath(ctx, [[0, -34], [0, 7]]);
        strokePath(ctx, [[-24, 7], [24, 7]]);
        strokePath(ctx, [[-16, 16], [16, 16]]);
        strokePath(ctx, [[-8, 25], [8, 25]]);
    }, { keywords: ['接地', '地線'] });

    add('circuit', 'currentArrow', '電流箭頭', 110, 44, function (ctx, item, options, metrics) {
        arrow(ctx, -metrics.width / 2, 0, metrics.width / 2, 0, 10, false);
    }, { measure: arrowMeasure, defaultLabel: 'I', labelPosition: { x: 0, y: -16 }, keywords: ['電流', '方向'] });

    add('circuit', 'acSource', '交流電源', 116, 64, function (ctx, item) {
        var p = paramsFor(item, 'acSource');
        terminals(ctx, p.span / 2, -28, 28);
        circle(ctx, 0, 0, 28, true);
        drawACSine(ctx, 0, 0, 34, 10);
    }, { keywords: ['交流', '電源'], parametric: terminalParametrics.acSource });

    /* Wave and optics assets. */
    add('waves', 'planeWave', '平面波', 130, 90, function (ctx, item, options, metrics) {
        var p = paramsFor(item, 'planeWave');
        for (var x = p.startX; x <= p.startX + p.length - 40; x += p.wavelength) {
            strokePath(ctx, [[x, -p.height / 2], [x, p.height / 2]]);
        }
        arrow(ctx, p.startX + p.length - 38, 0, p.startX + p.length - 10, 0, 9, false);
    }, { keywords: ['平面波', '波前'], modelNote: '線條是相鄰同相位波前，間距為圖示波長，不是位移－位置曲線。箭頭為傳播方向。至少保留兩條波前；波長增大到放不下時，顯示長度會隨之擴大，不改波長。尺寸以 px 排圖，未指定實際波速或頻率。', parametric: planeWaveParametric });

    add('waves', 'circularWave', '圓形波', 120, 120, function (ctx, item, options, metrics) {
        var p = paramsFor(item, 'circularWave');
        dot(ctx, 0, 0, 4);
        for (var r = p.wavelength; r <= p.radius; r += p.wavelength) circle(ctx, 0, 0, r, false);
    }, { keywords: ['圓形波', '點波源'], modelNote: '均勻介質中點源向外傳播的同相位波前快照，圓圈間距為圖示波長，不是粒子軌跡或強度。顯示半徑至少為 2λ；波長增大到放不下時，範圍同步擴大而不改波長。斜下方把手只改顯示範圍，不改波速或振幅。', parametric: circularWaveParametric });

    add('waves', 'sineWave', '正弦波', 150, 72, function (ctx, item, options, metrics) {
        var p = paramsFor(item, 'sineWave');
        if (p.showBaseline) {
            ctx.save(); ctx.setLineDash([6, 5]);
            strokePath(ctx, [[p.startX, 0], [p.startX + p.length, 0]]); ctx.restore();
        }
        begin(ctx);
        var segments = p.amplitude === 0 ? 1 : Math.ceil(Math.max(p.length / 2, p.length / p.wavelength * 48));
        for (var i = 0; i <= segments; i += 1) {
            var distance = p.length * i / segments;
            var x = p.startX + distance;
            var y = -sineWaveUnit(p, distance) * p.amplitude;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        if (p.direction) {
            var middle = p.startX + p.length / 2;
            arrow(ctx, middle - 20 * p.direction, -p.amplitude - 20, middle + 20 * p.direction, -p.amplitude - 20, 7, false);
            write(ctx, 'v', middle, -p.amplitude - 35, item, 13);
        }
    }, { keywords: ['正弦波', '波形', '相位', '行波'], modelNote: '同一時刻的位移－位置波形，圖上方為正位移；φ 是左端初相位，非時間。可畫不足一週期的片段：振幅點貼在可見曲線，右端只改長度並固定左端。不足一個波長或會撞到右端時，λ 改用數值欄；拖 λ 不超出目前片段，數值欄則可設定更長的波長。振幅最小為 0，拖過平衡位置不自動反相；反相請調 φ。可選平衡位置虛線與傳播箭頭；相同快照可以向左或向右傳，切方向不翻轉曲線。旋轉／鏡射後方向隨整圖變換。px 僅供排圖，未指定時間、波速或頻率，不是位移－時間圖。', parametric: sineWaveParametric });

    function slitRenderer(openings) {
        return function (ctx, item, options, metrics) {
            var top = -metrics.height / 2;
            var bottom = metrics.height / 2;
            var gap = 13;
            ctx.lineWidth *= 3;
            if (openings === 1) {
                strokePath(ctx, [[0, top], [0, -gap]]);
                strokePath(ctx, [[0, gap], [0, bottom]]);
            } else {
                strokePath(ctx, [[0, top], [0, -27]]);
                strokePath(ctx, [[0, -11], [0, 11]]);
                strokePath(ctx, [[0, 27], [0, bottom]]);
            }
        };
    }

    add('waves', 'singleSlit', '單狹縫', 42, 130, function (ctx, item) {
        var p = paramsFor(item, 'singleSlit');
        ctx.lineWidth *= 3;
        strokePath(ctx, [[0, -p.height / 2], [0, -p.aperture / 2]]);
        strokePath(ctx, [[0, p.aperture / 2], [0, p.height / 2]]);
    }, { keywords: ['單狹縫', '繞射'], parametric: singleSlitParametric });
    add('waves', 'doubleSlit', '雙狹縫', 42, 130, function (ctx, item) {
        var p = paramsFor(item, 'doubleSlit');
        var upperCenter = -p.separation / 2;
        var lowerCenter = p.separation / 2;
        ctx.lineWidth *= 3;
        strokePath(ctx, [[0, -p.height / 2], [0, upperCenter - p.aperture / 2]]);
        strokePath(ctx, [[0, upperCenter + p.aperture / 2], [0, lowerCenter - p.aperture / 2]]);
        strokePath(ctx, [[0, lowerCenter + p.aperture / 2], [0, p.height / 2]]);
    }, { keywords: ['雙狹縫', '干涉'], parametric: doubleSlitParametric });

    add('waves', 'barrier', '障礙物', 38, 130, function (ctx, item, options, metrics) {
        var p = paramsFor(item, 'barrier');
        ctx.lineWidth *= 3;
        strokePath(ctx, [[0, -p.height / 2], [0, p.height / 2]]);
        hatchLine(ctx, 0, -p.height / 2, 0, p.height / 2, 13, 10);
    }, { keywords: ['障礙物', '擋板'], parametric: barrierParametric });

    add('waves', 'ray', '光線', 130, 42, function (ctx, item, options, metrics) {
        arrow(ctx, -metrics.width / 2, 0, metrics.width / 2, 0, 10, false);
    }, { measure: arrowMeasure, keywords: ['光線', '光路'] });

    add('waves', 'convexLens', '凸透鏡', 58, 130, function (ctx, item, options, metrics) {
        var p = paramsFor(item, 'convexLens');
        begin(ctx);
        ctx.moveTo(0, -p.height / 2);
        ctx.bezierCurveTo(p.curvature, -p.height / 3, p.curvature, p.height / 3, 0, p.height / 2);
        ctx.bezierCurveTo(-p.curvature, p.height / 3, -p.curvature, -p.height / 3, 0, -p.height / 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }, { keywords: ['凸透鏡', '會聚透鏡'], parametric: convexLensParametric });

    add('waves', 'concaveLens', '凹透鏡', 58, 130, function (ctx, item, options, metrics) {
        var p = paramsFor(item, 'concaveLens');
        var outer = p.curvature;
        var waist = Math.max(6, p.curvature * 0.5);
        var halfHeight = p.height / 2;
        begin(ctx);
        ctx.moveTo(-outer, -halfHeight);
        ctx.lineTo(outer, -halfHeight);
        ctx.bezierCurveTo(outer * 0.78, -halfHeight * 0.64, waist, -halfHeight * 0.28, waist, 0);
        ctx.bezierCurveTo(waist, halfHeight * 0.28, outer * 0.78, halfHeight * 0.64, outer, halfHeight);
        ctx.lineTo(-outer, halfHeight);
        ctx.bezierCurveTo(-outer * 0.78, halfHeight * 0.64, -waist, halfHeight * 0.28, -waist, 0);
        ctx.bezierCurveTo(-waist, -halfHeight * 0.28, -outer * 0.78, -halfHeight * 0.64, -outer, -halfHeight);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }, { keywords: ['凹透鏡', '發散透鏡'], parametric: concaveLensParametric });

    add('waves', 'planeMirror', '平面鏡', 42, 130, function (ctx, item, options, metrics) {
        var p = paramsFor(item, 'planeMirror');
        ctx.lineWidth *= 2;
        strokePath(ctx, [[-5, -p.height / 2], [-5, p.height / 2]]);
        hatchLine(ctx, -5, -p.height / 2, -5, p.height / 2, 13, 11);
    }, { keywords: ['平面鏡', '鏡面'], parametric: planeMirrorParametric });

    add('waves', 'screen', '光屏', 42, 130, function (ctx, item, options, metrics) {
        var p = paramsFor(item, 'screen');
        ctx.lineWidth *= 2;
        strokePath(ctx, [[0, -p.height / 2], [0, p.height / 2]]);
        for (var y = -p.height / 2 + 8; y < p.height / 2; y += 13) {
            strokePath(ctx, [[0, y], [9, y + 6]]);
        }
    }, { keywords: ['光屏', '屏幕'], parametric: screenParametric });

    add('waves', 'normalLine', '法線', 120, 28, function (ctx, item, options, metrics) {
        ctx.setLineDash([8, 6]);
        strokePath(ctx, [[-metrics.width / 2, 0], [metrics.width / 2, 0]]);
        ctx.setLineDash([]);
    }, { measure: function (item) { return { width: lineMeasure(item).width, height: 48 }; }, defaultLabel: 'N', labelPosition: { x: 0, y: -13 }, keywords: ['法線', '垂線'] });

    add('waves', 'prism', '三稜鏡', 110, 100, function (ctx, item, options, metrics) {
        var p = paramsFor(item, 'prism');
        path(ctx, [[p.apex * p.width / 2, -p.height / 2], [-p.width / 2, p.height / 2], [p.width / 2, p.height / 2]], true);
        ctx.fill();
        ctx.stroke();
    }, { keywords: ['稜鏡', '色散'], parametric: prismParametric });

    add('waves', 'pointSource', '點波源', 54, 54, function (ctx) {
        var item = arguments[1];
        var p = paramsFor(item, 'pointSource');
        dot(ctx, 0, 0, 3);
        for (var r = p.wavelength; r <= p.radius; r += p.wavelength) circle(ctx, 0, 0, r, false);
    }, { defaultLabel: 'S', labelPosition: function (item) { var r = paramsFor(item, 'pointSource').radius; return { x: r / Math.SQRT2 + 12, y: -r / Math.SQRT2 - 12 }; }, keywords: ['點波源', '波源'], modelNote: '點源與向外傳播的同相位波前；二維圓形表示平面波紋，也可作球面波的截面，不是強度分布。半徑至少為 2λ，波長放不下時只擴大顯示範圍。波源名稱移到波紋外；可由物件文字欄修改。', parametric: pointSourceParametric });

    add('waves', 'diffraction', '單縫繞射波（遠場示意）', 150, 120, function (ctx, item, options, metrics) {
        var p = paramsFor(item, 'diffraction');
        var sourceX = -p.range / 2 + 20;
        ctx.save();
        ctx.beginPath(); ctx.rect(-p.range / 2, -p.height / 2, p.range, p.height); ctx.clip();
        ctx.lineWidth *= 2.5;
        strokePath(ctx, [[sourceX, -p.height / 2], [sourceX, -p.aperture / 2]]);
        strokePath(ctx, [[sourceX, p.aperture / 2], [sourceX, p.height / 2]]);
        ctx.lineWidth /= 2.5;
        // Fraunhofer angular intensity, sinc²(π a sinθ / λ). These radial
        // phase fronts illustrate the far-field angular envelope, not a near-field solver.
        for (var radius = p.wavelength; radius < p.range; radius += p.wavelength) {
            for (var segment = 0; segment < 120; segment += 1) {
                var startAngle = -Math.PI / 2 + Math.PI * segment / 120;
                var endAngle = startAngle + Math.PI / 120;
                var beta = Math.PI * p.aperture * Math.sin((startAngle + endAngle) / 2) / p.wavelength;
                var intensity = Math.abs(beta) < 1e-8 ? 1 : Math.pow(Math.sin(beta) / beta, 2);
                ctx.globalAlpha = intensity;
                begin(ctx);
                ctx.arc(sourceX, 0, radius, startAngle, endAngle);
                ctx.stroke();
            }
        }
        ctx.restore();
    }, { keywords: ['繞射', '單縫'], modelNote: '遠場角分布示意：明暗依 sinc²(πa sinθ/λ)；寬縫主瓣較窄。非狹縫附近的精確波前，考題光強曲線請用單縫繞射光強圖。', parametric: diffractionParametric });

    add('waves', 'interference', '雙縫干涉波', 160, 130, function (ctx, item, options, metrics) {
        var p = paramsFor(item, 'interference');
        var sourceX = -p.range / 2 + 18;
        var sourceYs = [-p.separation / 2, p.separation / 2];
        ctx.save();
        ctx.beginPath(); ctx.rect(-p.range / 2, -p.height / 2, p.range, p.height); ctx.clip();
        for (var s = 0; s < sourceYs.length; s += 1) {
            dot(ctx, sourceX, sourceYs[s], 3);
            for (var radius = p.wavelength; radius < p.range; radius += p.wavelength) {
                begin(ctx);
                ctx.arc(sourceX, sourceYs[s], radius, -Math.PI / 2, Math.PI / 2);
                ctx.stroke();
            }
        }
        ctx.restore();
    }, { keywords: ['干涉', '雙狹縫'], parametric: interferenceParametric });

    add('waves', 'concaveMirror', '凹面鏡', 54, 130, function (ctx, item, options, metrics) {
        var p = paramsFor(item, 'concaveMirror');
        drawSphericalMirror(ctx, p, false);
    }, { keywords: ['凹面鏡', '會聚鏡'], parametric: concaveMirrorParametric });

    add('waves', 'convexMirror', '凸面鏡', 54, 130, function (ctx, item, options, metrics) {
        var p = paramsFor(item, 'convexMirror');
        drawSphericalMirror(ctx, p, true);
    }, { keywords: ['凸面鏡', '發散鏡'], parametric: convexMirrorParametric });

    /* Graph assets. */
    add('graphs', 'axes', '座標軸', 160, 120, function (ctx, item, options, metrics) {
        drawAxes(ctx, metrics.width, metrics.height, item.xLabel || 'x', item.yLabel || 'y', item);
    }, { measure: graphMeasure, keywords: ['座標軸', '圖表'], parametric: axesParametric });

    add('graphs', 'lineGraph', '直線圖', 170, 126, function (ctx, item, options, metrics) {
        var a = drawAxes(ctx, metrics.width, metrics.height, item.xLabel || 't', item.yLabel || 'v', item);
        var p = paramsFor(item, 'lineGraph');
        var start = graphPoint(a, 0, p.start);
        var end = graphPoint(a, 0.94, p.end);
        strokePath(ctx, [[start.x, start.y], [end.x, end.y]]);
    }, { measure: graphMeasure, keywords: ['直線圖', 'v-t圖', '等加速度'], parametric: lineGraphParametric });

    add('graphs', 'curveGraph', '曲線圖', 170, 126, function (ctx, item, options, metrics) {
        var a = drawAxes(ctx, metrics.width, metrics.height, item.xLabel || 't', item.yLabel || 'x', item);
        var p = paramsFor(item, 'curveGraph');
        var start = graphPoint(a, 0, p.start);
        var control = graphPoint(a, 0.58, p.control);
        var end = graphPoint(a, 0.94, p.end);
        begin(ctx);
        ctx.moveTo(start.x, start.y);
        ctx.quadraticCurveTo(control.x, control.y, end.x, end.y);
        ctx.stroke();
    }, { measure: graphMeasure, keywords: ['曲線圖', 'x-t圖'], parametric: curveGraphParametric });

    add('graphs', 'pointGraph', '散點圖', 170, 126, function (ctx, item, options, metrics) {
        var p = paramsFor(item, 'pointGraph');
        if (p.dataMode) { var s = dataPlotState(item, p.dataPoints, 'scatter'); drawDataAxes(ctx, item, s, item.xLabel || 'x', item.yLabel || 'y'); p.dataPoints.forEach(function (r) { dot(ctx, s.x(r[0]), s.y(r[1]), 3.5); }); return; }
        var a = drawAxes(ctx, metrics.width, metrics.height, item.xLabel || 't', item.yLabel || 'y', item);
        var pts = [[0.12, p.p1], [0.28, p.p2], [0.43, p.p3], [0.58, p.p4], [0.72, p.p5], [0.87, p.p6]];
        for (var i = 0; i < pts.length; i += 1) {
            dot(ctx, a.left + (a.right - a.left) * pts[i][0], a.bottom - (a.bottom - a.top) * pts[i][1], 3.5);
        }
    }, { measure: graphMeasure, keywords: ['散點圖', '資料點'], dataEditor: flexibleSeriesEditor('pointGraph'), parametric: pointGraphParametric });

    add('graphs', 'velocityTimeGraph', '速度－時間圖', 180, 132, function (ctx, item, options, metrics) {
        var p = paramsFor(item, 'velocityTimeGraph');
        if (p.dataMode) { var s = dataPlotState(item, p.dataPoints, 'time'); drawDataAxes(ctx, item, s, 't (s)', 'v (m/s)'); strokePath(ctx, p.dataPoints.map(function (r) { return [s.x(r[0]), s.y(r[1])]; })); return; }
        var a = drawSignedTimeAxes(ctx, metrics.width, metrics.height, 'v', item);
        var start = signedGraphPoint(a, 0, p.start);
        var knee = signedGraphPoint(a, p.kneeTime, p.knee);
        var end = signedGraphPoint(a, 0.94, p.end);
        strokePath(ctx, [[start.x, start.y], [knee.x, knee.y], [end.x, end.y]]);
    }, { measure: graphMeasure, keywords: ['速度時間圖', 'v-t圖'], dataEditor: timeDataEditor('v'), parametric: velocityTimeParametric });

    add('graphs', 'constantVelocityGraph', '等速度 v-t 圖', 180, 132, function (ctx, item, options, metrics) {
        var a = drawSignedTimeAxes(ctx, metrics.width, metrics.height, 'v', item);
        var p = paramsFor(item, 'constantVelocityGraph');
        var start = signedGraphPoint(a, 0, p.start);
        var end = signedGraphPoint(a, 0.94, p.end);
        strokePath(ctx, [[start.x, start.y], [end.x, end.y]]);
    }, { measure: graphMeasure, keywords: ['等速度', 'v-t圖'], parametric: constantVelocityParametric });

    add('graphs', 'positionTimeGraph', '位置－時間圖', 180, 132, function (ctx, item, options, metrics) {
        var p = paramsFor(item, 'positionTimeGraph');
        if (p.dataMode) { var s = dataPlotState(item, p.dataPoints, 'time'); drawDataAxes(ctx, item, s, 't (s)', 'x (m)'); strokePath(ctx, p.dataPoints.map(function (r) { return [s.x(r[0]), s.y(r[1])]; })); return; }
        var a = drawAxes(ctx, metrics.width, metrics.height, 't', 'x', item);
        var start = graphPoint(a, 0, p.start);
        var control = graphPoint(a, 0.36, p.control);
        var end = graphPoint(a, 0.95, p.end);
        begin(ctx);
        ctx.moveTo(start.x, start.y);
        ctx.quadraticCurveTo(control.x, control.y, end.x, end.y);
        ctx.stroke();
    }, { measure: graphMeasure, keywords: ['位置時間圖', 'x-t圖'], modelNote: '自訂資料使用 t（s）、x（m），支援負位置、折返與停留；時間須嚴格遞增，位置不能瞬間跳躍。折線轉角表示理想瞬時速度改變，不代表有限加速度。', dataEditor: { columns: ['t', 'x'], kind: 'position', hint: '每行輸入時間 t（s）、位置 x（m），時間須嚴格遞增；相鄰相同位置表示停留，位置下降表示往負方向移動。藍點上下改位置，時間由表格設定。', rows: function (item) { var p = paramsFor(item, item.type); return p.dataPoints.length ? p.dataPoints : positionSampleRows; }, apply: function (item, rows) { item.params = sanitizeParams(item.type, Object.assign({}, item.params, { dataMode: 1, dataPoints: rows, dataDomain: dataDomain(rows, 'time') })); } }, parametric: positionTimeParametric });

    add('graphs', 'accelerationTimeGraph', '加速度－時間圖', 180, 132, function (ctx, item, options, metrics) {
        var p = paramsFor(item, 'accelerationTimeGraph');
        if (p.dataMode) { var s = dataPlotState(item, p.dataPoints, 'time'); drawDataAxes(ctx, item, s, 't (s)', 'a (m/s²)'); strokePath(ctx, p.dataPoints.map(function (r) { return [s.x(r[0]), s.y(r[1])]; })); return; }
        var a = drawSignedTimeAxes(ctx, metrics.width, metrics.height, 'a', item);
        var start = signedGraphPoint(a, 0, p.start);
        var end = signedGraphPoint(a, 0.94, p.end);
        strokePath(ctx, [[start.x, start.y], [end.x, end.y]]);
        ctx.setLineDash([5, 5]);
        strokePath(ctx, [[a.left, start.y], [a.left, a.zero]]);
        ctx.setLineDash([]);
    }, { measure: graphMeasure, keywords: ['加速度時間圖', 'a-t圖'], dataEditor: timeDataEditor('a'), parametric: accelerationTimeParametric });

    add('graphs', 'barGraph', '長條圖', 180, 132, function (ctx, item, options, metrics) {
        var p = paramsFor(item, 'barGraph');
        if (p.dataMode) {
            var s = dataPlotState(item, p.dataPoints, 'bars'); drawDataAxes(ctx, item, s, item.xLabel || 'x', item.yLabel || 'y');
            var xs = p.dataPoints.map(function (r) { return s.x(r[0]); }).sort(function (a, b) { return a - b; });
            var width = 22; for (var j = 1; j < xs.length; j += 1) width = Math.min(width, (xs[j] - xs[j - 1]) * 0.65);
            p.dataPoints.forEach(function (r) { var x = s.x(r[0]); var y = s.y(r[1]); var base = s.y(0); ctx.fillRect(x - width / 2, Math.min(y, base), width, Math.abs(base - y)); ctx.strokeRect(x - width / 2, Math.min(y, base), width, Math.abs(base - y)); });
            return;
        }
        var a = drawAxes(ctx, metrics.width, metrics.height, item.xLabel || '類別', item.yLabel || '值', item);
        var base = a.bottom;
        var ratios = [p.b1, p.b2, p.b3, p.b4];
        var graphHeight = a.bottom - a.top;
        for (var i = 0; i < ratios.length; i += 1) {
            var height = ratios[i] * graphHeight;
            var x = a.left + (a.right - a.left) * ([0.16, 0.36, 0.56, 0.76][i]) - 8;
            ctx.fillRect(x, base - height, 17, height);
            ctx.strokeRect(x, base - height, 17, height);
        }
    }, { measure: graphMeasure, keywords: ['長條圖', '柱狀圖'], dataEditor: flexibleSeriesEditor('barGraph'), parametric: barGraphParametric });

    function getDefinition(type) {
        return definitions[type] || null;
    }

    function getAssetsForCategory(categoryId) {
        return assets.filter(function (asset) {
            return asset.category === categoryId;
        });
    }

    function getMetrics(item, definition) {
        var metrics = definition.measure ? definition.measure(item || {}, definition) : {
            width: positive(item && item.width, definition.width, 1),
            height: positive(item && item.height, definition.height, 1)
        };
        return {
            width: positive(metrics.width, definition.width, 1),
            height: positive(metrics.height, definition.height, 1)
        };
    }

    function isParametric(type) {
        var definition = getDefinition(type);
        return Boolean(definition && definition.parametric);
    }

    function getDefaultParams(type, source) {
        var definition = getDefinition(type);
        var config = definition && definition.parametric;
        if (!config) return null;
        var defaults = config.defaults || {};
        var incoming = source && typeof source === 'object' ? source : {};
        var merged = {};
        Object.keys(defaults).forEach(function (key) {
            merged[key] = Object.prototype.hasOwnProperty.call(incoming, key)
                ? incoming[key]
                : defaults[key];
        });
        return config.sanitize ? config.sanitize(merged) : merged;
    }

    function sanitizeParams(type, source) {
        return getDefaultParams(type, source);
    }

    function getParameterControls(type, item) {
        var definition = getDefinition(type);
        var config = definition && definition.parametric;
        var controls = config && item && config.getControls ? config.getControls(item) : config && config.controls;
        if (!Array.isArray(controls)) return [];
        return controls.map(function (control) {
            var normalized = {
                key: String(control.key),
                label: String(control.label || control.key),
                min: number(control.min, 0),
                max: number(control.max, 100),
                step: positive(control.step, 1, 0.01),
                continuous: Boolean(control.continuous),
                unit: String(control.unit || '')
            };
            if (control.kind === 'select' && Array.isArray(control.choices)) {
                normalized.kind = 'select';
                normalized.choices = control.choices.map(function (option) {
                    return { value: number(option.value, 0), label: String(option.label || option.value) };
                });
            }
            return normalized;
        });
    }

    function localBoundsFor(item, definition, metrics) {
        var raw = definition.parametric && typeof definition.parametric.bounds === 'function'
            ? definition.parametric.bounds(item)
            : {
                left: -metrics.width / 2,
                top: -metrics.height / 2,
                right: metrics.width / 2,
                bottom: metrics.height / 2
            };
        var left = number(raw.left, -metrics.width / 2);
        var right = number(raw.right, metrics.width / 2);
        var top = number(raw.top, -metrics.height / 2);
        var bottom = number(raw.bottom, metrics.height / 2);
        return {
            left: Math.min(left, right),
            top: Math.min(top, bottom),
            right: Math.max(left, right),
            bottom: Math.max(top, bottom)
        };
    }

    function localPointToWorld(item, localX, localY) {
        var scale = positive(item && item.scale, 1, 0.01);
        var scaledX = number(localX, 0) * scale * (item && item.flippedX ? -1 : 1);
        var scaledY = number(localY, 0) * scale * (item && item.flippedY ? -1 : 1);
        var radians = number(item && item.rotation, 0) * DEG;
        return {
            x: number(item && item.x, 0) + scaledX * Math.cos(radians) - scaledY * Math.sin(radians),
            y: number(item && item.y, 0) + scaledX * Math.sin(radians) + scaledY * Math.cos(radians)
        };
    }

    function localVectorToWorld(item, localX, localY) {
        var scale = positive(item && item.scale, 1, 0.01);
        var scaledX = number(localX, 0) * scale * (item && item.flippedX ? -1 : 1);
        var scaledY = number(localY, 0) * scale * (item && item.flippedY ? -1 : 1);
        var radians = number(item && item.rotation, 0) * DEG;
        return {
            x: scaledX * Math.cos(radians) - scaledY * Math.sin(radians),
            y: scaledX * Math.sin(radians) + scaledY * Math.cos(radians)
        };
    }

    function worldPointToLocal(item, worldX, worldY) {
        var scale = positive(item && item.scale, 1, 0.01);
        var radians = -number(item && item.rotation, 0) * DEG;
        var dx = number(worldX, 0) - number(item && item.x, 0);
        var dy = number(worldY, 0) - number(item && item.y, 0);
        var rotatedX = dx * Math.cos(radians) - dy * Math.sin(radians);
        var rotatedY = dx * Math.sin(radians) + dy * Math.cos(radians);
        return {
            x: rotatedX / scale * (item && item.flippedX ? -1 : 1),
            y: rotatedY / scale * (item && item.flippedY ? -1 : 1)
        };
    }

    function fallbackSemanticHandles(item, definition) {
        var config = definition && definition.parametric;
        var controls = config && Array.isArray(config.controls) ? config.controls : [];
        var byKey = {};
        controls.forEach(function (entry) { byKey[entry.key] = entry; });
        var p = item && item.params ? item.params : {};
        function readout(keys) {
            return keys.map(function (key) {
                var entry = byKey[key];
                return (entry && entry.label ? entry.label : key) + ' ' + Math.round(number(p[key], 0)) + (entry && entry.unit ? ' ' + entry.unit : '');
            }).join(' · ');
        }
        if (byKey.width && byKey.height && Number.isFinite(Number(p.width)) && Number.isFinite(Number(p.height))) {
            return [{ id: '__auto-extent', label: '圖形尺寸', x: p.width / 2, y: p.height / 2, primary: true, readout: readout(['width', 'height']) }];
        }
        if (byKey.width && Number.isFinite(Number(p.width))) {
            return [{ id: '__auto-width', label: byKey.width.label || '寬度', x: p.width / 2, y: 0, primary: true, readout: readout(['width']) }];
        }
        if (byKey.length && Number.isFinite(Number(p.length))) {
            return [{ id: '__auto-length', label: byKey.length.label || '長度', x: p.length / 2, y: 0, primary: true, readout: readout(['length']) }];
        }
        if (byKey.radius && Number.isFinite(Number(p.radius))) {
            return [{ id: '__auto-radius', label: byKey.radius.label || '半徑', x: p.radius, y: 0, primary: true, readout: readout(['radius']) }];
        }
        return [];
    }

    function updateFallbackSemanticHandle(item, definition, handleId, localPoint) {
        var p = Object.assign({}, item.params || {});
        if (handleId === '__auto-extent') {
            p.width = Math.abs(localPoint.x) * 2;
            p.height = Math.abs(localPoint.y) * 2;
        } else if (handleId === '__auto-width') {
            p.width = Math.abs(localPoint.x) * 2;
        } else if (handleId === '__auto-length') {
            p.length = Math.abs(localPoint.x) * 2;
        } else if (handleId === '__auto-radius') {
            p.radius = Math.hypot(localPoint.x, localPoint.y);
        } else {
            return null;
        }
        item.params = sanitizeParams(item.type, p);
        var current = fallbackSemanticHandles(item, definition).find(function (handle) { return handle.id === handleId; });
        return { readout: current ? current.readout : '' };
    }

    function getSemanticHandles(item) {
        if (!item) return [];
        var definition = getDefinition(item.type);
        var config = definition && definition.parametric;
        if (!config) return [];
        item.params = getDefaultParams(item.type, item.params);
        var localHandles = typeof config.handles === 'function'
            ? config.handles(item)
            : fallbackSemanticHandles(item, definition);
        return localHandles.map(function (handle) {
            var world = localPointToWorld(item, handle.x, handle.y);
            return {
                id: String(handle.id),
                label: String(handle.label || handle.id),
                x: world.x,
                y: world.y,
                localX: number(handle.x, 0),
                localY: number(handle.y, 0),
                primary: Boolean(handle.primary),
                readout: String(handle.readout || '')
            };
        });
    }

    function updateSemanticHandle(item, handleId, worldX, worldY, options) {
        if (!item) return null;
        var definition = getDefinition(item.type);
        var config = definition && definition.parametric;
        if (!config) return null;
        item.params = getDefaultParams(item.type, item.params);
        var localPoint = worldPointToLocal(item, worldX, worldY);
        // Press/release at an existing handle is not an edit. In particular it
        // must not quantize derived values, switch a physical model, or freeze
        // an auto-scaled graph domain after rotation/mirroring round-off.
        var previous = getSemanticHandles(item).find(function (handle) { return handle.id === String(handleId); });
        if (!previous) return null;
        if (Math.hypot(localPoint.x - previous.localX, localPoint.y - previous.localY) < 1e-8) {
            return { readout: previous.readout, point: { x: previous.x, y: previous.y }, handle: previous };
        }
        var result = typeof config.update === 'function'
            ? (config.update(item, String(handleId), localPoint, options || {}) || {})
            : updateFallbackSemanticHandle(item, definition, String(handleId), localPoint);
        if (!result) return null;
        item.params = getDefaultParams(item.type, item.params);
        if (result.originShift) {
            var worldShift = localVectorToWorld(item, result.originShift.x, result.originShift.y);
            item.x = number(item.x, 0) + worldShift.x;
            item.y = number(item.y, 0) + worldShift.y;
        }
        var handles = getSemanticHandles(item);
        var current = handles.find(function (handle) { return handle.id === String(handleId); }) || null;
        return {
            readout: String(result.readout || (current && current.readout) || ''),
            point: current ? { x: current.x, y: current.y } : { x: number(worldX, 0), y: number(worldY, 0) },
            handle: current
        };
    }

    function resolvedLabel(item, definition) {
        return Object.prototype.hasOwnProperty.call(item, 'label') ? String(item.label) : definition.defaultLabel;
    }

    function rendererTextContext(ctx, overrides) {
        if (!overrides || typeof overrides !== 'object') return ctx;
        var methods = Object.create(null);
        return new Proxy(ctx, {
            get: function (target, key) {
                var value = Reflect.get(target, key, target);
                if (typeof value !== 'function') return value;
                if (!methods[key]) {
                    methods[key] = (key === 'fillText' || key === 'strokeText')
                        ? function () {
                            var args = Array.prototype.slice.call(arguments);
                            var original = String(args[0]);
                            if (Object.prototype.hasOwnProperty.call(overrides, original)) {
                                args[0] = String(overrides[original]);
                                if (!args[0]) return;
                            } else if (original === '|q|E' && Object.prototype.hasOwnProperty.call(overrides, 'qE')) {
                                args[0] = String(overrides.qE);
                                if (!args[0]) return;
                            }
                            return value.apply(target, args);
                        }
                        : value.bind(target);
                }
                return methods[key];
            },
            set: function (target, key, value) { return Reflect.set(target, key, value, target); }
        });
    }

    function collectRendererLabels(item, marker) {
        var definition = item && getDefinition(item.type);
        if (!definition) return [];
        var copy = Object.assign({}, item, { params: getDefaultParams(item.type, item.params) });
        if (marker !== undefined) copy.label = marker;
        var labels = [];
        var context = new Proxy({
            fillText: function (value) { labels.push(String(value)); },
            strokeText: function (value) { labels.push(String(value)); },
            measureText: function (value) { return { width: String(value).length * 12 }; },
            strokeStyle: '#111111', fillStyle: '#ffffff', lineWidth: 2, globalAlpha: 1
        }, {
            get: function (target, key) { return key in target ? target[key] : function () {}; },
            set: function (target, key, value) { target[key] = value; return true; }
        });
        definition.draw(context, copy, { strokeStyle: '#111111', fillStyle: '#ffffff', paper: '#ffffff' }, getMetrics(copy, definition));
        return labels;
    }

    function supportsCommonLabel(item) {
        var definition = item && getDefinition(item.type);
        if (!definition) return false;
        if (!definition.suppressCommonLabel) return true;
        var marker = '__PHYSICS_DIAGRAM_COMMON_LABEL_PROBE__';
        return collectRendererLabels(item, marker).some(function (label) { return label.indexOf(marker) >= 0; });
    }

    function getEditableLabels(item) {
        var marker = '__PHYSICS_DIAGRAM_COMMON_LABEL_PROBE__';
        var original = collectRendererLabels(item);
        var marked = collectRendererLabels(item, marker);
        var commonLabels = new Set();
        if (original.length === marked.length) {
            marked.forEach(function (value, index) { if (value.indexOf(marker) >= 0) commonLabels.add(original[index]); });
        }
        return Array.from(new Set(original.filter(function (value) { return value && !commonLabels.has(value); })));
    }

    function draw(ctx, item, options) {
        if (!ctx || !item) return false;
        var definition = getDefinition(item.type);
        if (!definition) return false;
        var settings = options || {};
        var scale = positive(item.scale, 1, 0.01);
        var metrics = getMetrics(item, definition);
        var flipX = item.flippedX ? -1 : 1;
        var flipY = item.flippedY ? -1 : 1;
        var label;
        var labelPosition;
        var rotation = number(item.rotation, 0) * DEG;
        var originX = number(item.x, 0);
        var originY = number(item.y, 0);

        ctx.save();
        ctx.translate(originX, originY);
        ctx.rotate(rotation);
        ctx.scale(scale * flipX, scale * flipY);
        ctx.strokeStyle = settings.strokeStyle || settings.ink || '#111111';
        ctx.fillStyle = settings.fillStyle || settings.paper || '#ffffff';
        ctx.lineWidth = positive(item.strokeWidth, number(settings.strokeWidth, 2), 0.5);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash([]);
        definition.draw(rendererTextContext(ctx, item.textOverrides), item, settings, metrics);

        if (!definition.suppressCommonLabel) {
            label = resolvedLabel(item, definition);
            if (label) {
                labelPosition = typeof definition.labelPosition === 'function'
                    ? definition.labelPosition(item, metrics)
                    : (definition.labelPosition || { x: 0, y: -metrics.height / 2 - 11 });
            }
        }
        ctx.restore();
        if (label && labelPosition) {
            var localX = labelPosition.x * scale * flipX;
            var localY = labelPosition.y * scale * flipY;
            var worldX = originX + localX * Math.cos(rotation) - localY * Math.sin(rotation);
            var worldY = originY + localX * Math.sin(rotation) + localY * Math.cos(rotation);
            ctx.save();
            ctx.fillStyle = settings.textStyle || settings.strokeStyle || settings.ink || '#111111';
            ctx.font = String(number(settings.fontSize, 17) * Math.max(0.55, Math.min(2.4, scale))) + 'px "Times New Roman", "Noto Sans TC", serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, worldX, worldY);
            ctx.restore();
        }
        return true;
    }

    function getBounds(item) {
        if (!item) return null;
        var definition = getDefinition(item.type);
        if (!definition) return null;
        var metrics = getMetrics(item, definition);
        var centerX = number(item.x, 0);
        var centerY = number(item.y, 0);
        var localBounds = localBoundsFor(item, definition, metrics);
        var corners = [
            [localBounds.left, localBounds.top],
            [localBounds.right, localBounds.top],
            [localBounds.right, localBounds.bottom],
            [localBounds.left, localBounds.bottom]
        ];
        var left = Infinity;
        var top = Infinity;
        var right = -Infinity;
        var bottom = -Infinity;
        for (var i = 0; i < corners.length; i += 1) {
            var world = localPointToWorld(item, corners[i][0], corners[i][1]);
            left = Math.min(left, world.x);
            top = Math.min(top, world.y);
            right = Math.max(right, world.x);
            bottom = Math.max(bottom, world.y);
        }
        return {
            x: left,
            y: top,
            left: left,
            top: top,
            right: right,
            bottom: bottom,
            width: right - left,
            height: bottom - top,
            centerX: centerX,
            centerY: centerY
        };
    }

    function getGeometry(item) {
        if (!item) return null;
        var definition = getDefinition(item.type);
        if (!definition) return null;
        var metrics = getMetrics(item, definition);
        var localBounds = localBoundsFor(item, definition, metrics);
        return {
            x: number(item.x, 0),
            y: number(item.y, 0),
            width: localBounds.right - localBounds.left,
            height: localBounds.bottom - localBounds.top,
            localBounds: localBounds,
            scale: positive(item.scale, 1, 0.01),
            rotation: number(item.rotation, 0),
            flippedX: Boolean(item.flippedX),
            flippedY: Boolean(item.flippedY),
            parametric: Boolean(definition.parametric)
        };
    }

    function hitTest(item, x, y) {
        if (!item) return false;
        var definition = getDefinition(item.type);
        if (!definition) return false;
        var metrics = getMetrics(item, definition);
        var localBounds = localBoundsFor(item, definition, metrics);
        var local = worldPointToLocal(item, x, y);
        var padding = Math.max(6, positive(item.strokeWidth, 2, 0.5) * 2);
        if (definition.parametric && typeof definition.parametric.hitTest === 'function') {
            return Boolean(definition.parametric.hitTest(item, local, padding));
        }
        return local.x >= localBounds.left - padding && local.x <= localBounds.right + padding
            && local.y >= localBounds.top - padding && local.y <= localBounds.bottom + padding;
    }

    // Attachment ports are geometry, not draggable parameter handles. Ropes
    // may attach to pulleys; masses may attach to either (an acyclic graph).
    function getAttachmentPorts(item) {
        var ports = [];
        if (item.type === 'pulley' || item.type === 'movablePulley') {
            var p = paramsFor(item, item.type); var sign = item.type === 'movablePulley' ? -1 : 1;
            ports = [{ id: 'left-rope', label: '左繩端', x: -p.radius, y: sign * p.leftRope }, { id: 'right-rope', label: '右繩端', x: p.radius, y: sign * p.rightRope }];
            if (sign < 0) ports.push({ id: 'load-hook', label: '下方掛鉤', x: 0, y: p.radius + 20 });
        } else if (item.type === 'rope') {
            // The line editor names start/end in world orientation, regardless
            // of the visually equivalent flip flags of a plain line.
            var half = item.length * positive(item.scale, 1, 0.01) / 2; var a = number(item.rotation, 0) * DEG;
            return [{ id: 'start', label: '起端', x: item.x - half * Math.cos(a), y: item.y - half * Math.sin(a) }, { id: 'end', label: '末端', x: item.x + half * Math.cos(a), y: item.y + half * Math.sin(a) }];
        }
        return ports.map(function (port) { var world = localPointToWorld(item, port.x, port.y); return { id: port.id, label: port.label, x: world.x, y: world.y }; });
    }

    window.PhysicsDiagramAssets = {
        drawInductorWinding: drawInductorWinding,
        drawACSine: drawACSine,
        categories: categories,
        assets: assets,
        registerAsset: add,
        registerCategory: addCategory,
        getAssetsForCategory: getAssetsForCategory,
        getDefinition: getDefinition,
        draw: draw,
        getBounds: getBounds,
        getGeometry: getGeometry,
        hitTest: hitTest,
        isParametric: isParametric,
        getDefaultParams: getDefaultParams,
        sanitizeParams: sanitizeParams,
        getParameterControls: getParameterControls,
        getSemanticHandles: getSemanticHandles,
        getAttachmentPorts: getAttachmentPorts,
        updateSemanticHandle: updateSemanticHandle,
        getEditableLabels: getEditableLabels,
        supportsCommonLabel: supportsCommonLabel,
        getDataEditor: getDataEditor,
        applyDataText: applyDataText,
        validateDataRows: validateDataRows,
        dataDomain: dataDomain,
        dataPlotState: dataPlotState,
        integrateLinearData: integrateLinearData,
        integrateAccelerationSegments: integrateAccelerationSegments,
        drawDataAxes: drawDataAxes
    };
}());
