(function () {
    'use strict';

    var library = window.PhysicsDiagramAssets;
    if (!library || typeof library.registerAsset !== 'function') return;

    var add = library.registerAsset;
    var DEG = Math.PI / 180;

    function number(value, fallback) {
        var parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function clamp(value, minimum, maximum, fallback) {
        return Math.max(minimum, Math.min(maximum, number(value, fallback)));
    }

    function control(key, label, minimum, maximum, step, unit) {
        return { key: key, label: label, min: minimum, max: maximum, step: step || 1, unit: unit || '' };
    }

    function choice(key, label, choices) {
        var values = choices.map(function (entry) { return Number(entry.value); });
        return {
            key: key,
            label: label,
            kind: 'select',
            choices: choices.map(function (entry) {
                return { value: Number(entry.value), label: String(entry.label) };
            }),
            min: Math.min.apply(null, values),
            max: Math.max.apply(null, values),
            step: 1,
            unit: ''
        };
    }

    function solutionControl() {
        return choice('solutionMode', '題目／解答', [{ value: 0, label: '題目（隱藏解答幾何）' }, { value: 1, label: '解答（顯示作圖）' }]);
    }
    function focusControl() {
        return choice('showFoci', '焦點／曲率中心標示', [{ value: 0, label: '隱藏' }, { value: 1, label: '顯示' }]);
    }

    function smart(defaults, controls, methods) {
        var config = methods || {};
        config.defaults = defaults;
        config.controls = controls;
        if (!config.sanitize) {
            config.sanitize = function (source) {
                var incoming = source && typeof source === 'object' ? source : {};
                var output = {};
                controls.forEach(function (entry) {
                    var value = clamp(incoming[entry.key], entry.min, entry.max, defaults[entry.key]);
                    if (entry.choices && entry.choices.length) {
                        var allowed = entry.choices.map(function (option) { return option.value; });
                        output[entry.key] = allowed.reduce(function (nearest, candidate) {
                            return Math.abs(candidate - value) < Math.abs(nearest - value) ? candidate : nearest;
                        }, allowed.indexOf(defaults[entry.key]) >= 0 ? defaults[entry.key] : allowed[0]);
                    } else {
                        output[entry.key] = entry.step >= 1 ? Math.round(value) : Math.round(value / entry.step) * entry.step;
                    }
                });
                Object.keys(defaults).forEach(function (key) {
                    if (!Object.prototype.hasOwnProperty.call(output, key)) output[key] = defaults[key];
                });
                return output;
            };
        }
        return config;
    }

    function params(type, item) {
        var value = library.sanitizeParams(type, item && item.params) || {};
        if (item) item.params = value;
        return value;
    }

    function begin(ctx) { ctx.beginPath(); }

    function path(ctx, points, close) {
        if (!points.length) return;
        begin(ctx);
        ctx.moveTo(points[0][0], points[0][1]);
        for (var i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
        if (close) ctx.closePath();
    }

    function stroke(ctx, points, close) {
        path(ctx, points, close);
        ctx.stroke();
    }

    function filledPath(ctx, points, close) {
        path(ctx, points, close !== false);
        ctx.fill();
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

    function text(ctx, value, x, y, size, align) {
        ctx.save();
        ctx.fillStyle = ctx.strokeStyle;
        ctx.font = String(size || 16) + 'px "Times New Roman", "Noto Sans TC", serif';
        ctx.textAlign = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(value), x, y);
        ctx.restore();
    }

    function arrow(ctx, x1, y1, x2, y2, size, atStart) {
        var angle = Math.atan2(y2 - y1, x2 - x1);
        var head = size || 8;
        stroke(ctx, [[x1, y1], [x2, y2]]);
        function drawHead(x, y, direction) {
            ctx.save();
            ctx.fillStyle = ctx.strokeStyle;
            filledPath(ctx, [
                [x, y],
                [x - head * Math.cos(direction - Math.PI / 6), y - head * Math.sin(direction - Math.PI / 6)],
                [x - head * Math.cos(direction + Math.PI / 6), y - head * Math.sin(direction + Math.PI / 6)]
            ]);
            ctx.restore();
        }
        drawHead(x2, y2, angle);
        if (atStart) drawHead(x1, y1, angle + Math.PI);
    }

    function dashed(ctx, points) {
        ctx.save();
        ctx.setLineDash([6, 5]);
        stroke(ctx, points);
        ctx.restore();
    }

    function cross(ctx, x, y, radius) {
        stroke(ctx, [[x - radius, y - radius], [x + radius, y + radius]]);
        stroke(ctx, [[x - radius, y + radius], [x + radius, y - radius]]);
    }

    function axes(ctx, width, height, xLabel, yLabel) {
        var geometry = axesGeometry(width, height);
        var left = geometry.left;
        var right = geometry.right;
        var top = geometry.top;
        var bottom = geometry.bottom;
        arrow(ctx, left, bottom, right, bottom, 7);
        arrow(ctx, left, bottom, left, top, 7);
        text(ctx, xLabel, right - 2, bottom + 13, 13);
        text(ctx, yLabel, left - 14, top + 2, 13);
        return { left: left, right: right, top: top, bottom: bottom };
    }

    function axesGeometry(width, height) {
        return { left: -width / 2 + 18, right: width / 2 - 10, top: -height / 2 + 10, bottom: height / 2 - 18 };
    }

    function defaultBounds(width, height, padding) {
        return function () {
            var inset = padding || 6;
            return { left: -width / 2 - inset, top: -height / 2 - inset, right: width / 2 + inset, bottom: height / 2 + inset };
        };
    }

    function radiusSmart(type, defaultRadius, minimum, maximum, label) {
        return smart(
            { radius: defaultRadius },
            [control('radius', label || '大小', minimum, maximum, 1, 'px')],
            {
                bounds: function (item) {
                    var p = params(type, item);
                    return { left: -p.radius - 7, top: -p.radius - 7, right: p.radius + 7, bottom: p.radius + 7 };
                },
                handles: function (item) {
                    var p = params(type, item);
                    return [{ id: 'radius', label: label || '大小', x: p.radius, y: 0, primary: true, readout: 'r ' + p.radius + ' px' }];
                },
                update: function (item, id, point) {
                    if (id !== 'radius') return null;
                    var p = params(type, item);
                    p.radius = clamp(Math.hypot(point.x, point.y), minimum, maximum, p.radius);
                    item.params = library.sanitizeParams(type, p);
                    return { readout: 'r ' + Math.round(item.params.radius) + ' px' };
                }
            }
        );
    }

    function drawBlock(ctx, x, y, width, height, label) {
        ctx.fillRect(x - width / 2, y - height / 2, width, height);
        ctx.strokeRect(x - width / 2, y - height / 2, width, height);
        if (label) text(ctx, label, x, y + 1, 16);
    }

    function massSymbol(ctx, x, y, index) {
        text(ctx, 'm', x - 3, y - 1, 22);
        text(ctx, String(index), x + 10, y + 7, 12);
    }

    /* Mechanics: reusable systems rather than frozen illustrations. */
    function freeBodyVector(length, angle) {
        var radians = angle * DEG;
        return { x: Math.cos(radians) * length, y: -Math.sin(radians) * length };
    }

    function normalizeFreeBodyAngle(value) {
        var angle = number(value, 0);
        return ((angle + 180) % 360 + 360) % 360 - 180;
    }

    function freeBodyForceVector(force, inclineDegrees) {
        var incline = inclineDegrees * DEG;
        var unit;
        if (force.mode === 'vertical') unit = { x: 0, y: 1 };
        else if (force.mode === 'normal') unit = { x: -Math.sin(incline), y: -Math.cos(incline) };
        else if (force.mode === 'tangent') unit = { x: Math.cos(incline), y: -Math.sin(incline) };
        else return freeBodyVector(force.magnitude, force.angle);
        var direction = force.direction < 0 ? -1 : 1;
        return { x: unit.x * direction * force.magnitude, y: unit.y * direction * force.magnitude };
    }

    function sanitizeFreeBodyForce(source, index, usedIds) {
        var incoming = source && typeof source === 'object' ? source : {};
        var baseId = String(incoming.id || 'force-' + (index + 1)).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'force-' + (index + 1);
        var id = baseId;
        var suffix = 2;
        while (usedIds[id]) { id = baseId + '-' + suffix; suffix += 1; }
        usedIds[id] = true;
        var allowedModes = { free: true, vertical: true, normal: true, tangent: true };
        var mode = allowedModes[incoming.mode] ? incoming.mode : 'free';
        var labelCharacters = Array.from(String(incoming.label == null ? 'F' : incoming.label).trim());
        return {
            id: id,
            label: labelCharacters.slice(0, 12).join('') || 'F',
            magnitude: Math.round(clamp(incoming.magnitude, 0, 180, 60)),
            mode: mode,
            direction: number(incoming.direction, 1) < 0 ? -1 : 1,
            angle: normalizeFreeBodyAngle(incoming.angle)
        };
    }

    function freeBodyState(item) {
        var p = params('freeBodyDiagram', item);
        var incline = p.incline * DEG;
        var surfaceDirection = { x: Math.cos(incline), y: -Math.sin(incline) };
        var normalDirection = { x: -Math.sin(incline), y: -Math.cos(incline) };
        var contactDistance = p.bodyKind === 0 ? 25 : p.bodyKind === 2 ? 26 : 42;
        var surfaceOffset = { x: -normalDirection.x * contactDistance, y: -normalDirection.y * contactDistance };
        var bodyAngle = p.showSurface ? -incline : 0;
        var bodyCorners = [[-34, -25], [34, -25], [34, 25], [-34, 25]].map(function (point) {
            return { x: point[0] * Math.cos(bodyAngle) - point[1] * Math.sin(bodyAngle),
                y: point[0] * Math.sin(bodyAngle) + point[1] * Math.cos(bodyAngle) };
        });
        return {
            p: p,
            bodyCorners: bodyCorners,
            surfaceDirection: surfaceDirection,
            normalDirection: normalDirection,
            surfaceStart: {
                x: surfaceOffset.x - surfaceDirection.x * 112,
                y: surfaceOffset.y - surfaceDirection.y * 112
            },
            surfaceEnd: {
                x: surfaceOffset.x + surfaceDirection.x * 112,
                y: surfaceOffset.y + surfaceDirection.y * 112
            },
            slopeHandle: { x: surfaceDirection.x * 112, y: surfaceDirection.y * 112 },
            forces: p.forces.map(function (force) {
                return { force: force, tip: freeBodyForceVector(force, p.incline) };
            })
        };
    }

    function freeBodyModeLabel(mode) {
        return { free: '自由方向', vertical: '鉛直', normal: '斜面法向', tangent: '沿斜面' }[mode] || '自由方向';
    }

    function freeBodyReadout(force) {
        if (!force) return '';
        return force.label + ' ' + Math.round(force.magnitude) + ' px · ' + freeBodyModeLabel(force.mode);
    }

    function freeBodyAngle(point) {
        var value = -Math.atan2(point.y, point.x) / DEG;
        if (value > 180) value -= 360;
        if (value < -180) value += 360;
        return value;
    }

    var freeBodyParametric = smart(
        {
            schemaVersion: null,
            forces: null,
            incline: 25,
            weight: 88,
            normal: 76,
            friction: -48,
            applied: 66,
            appliedAngle: 15,
            tension: 58,
            tensionAngle: 150,
            bodyKind: 0,
            showBodyLabel: 1,
            showSurface: 1,
            showForces: 1
        },
        [
            choice('bodyKind', '受力物體', [{ value: 0, label: '木塊' }, { value: 1, label: '質點' }, { value: 2, label: '圓形物體' }]),
            choice('showBodyLabel', '物體標籤', [{ value: 0, label: '隱藏' }, { value: 1, label: '顯示（可在圖中文字改名）' }]),
            choice('showSurface', '斜面參考線', [{ value: 0, label: '隱藏' }, { value: 1, label: '顯示' }]),
            choice('showForces', '力向量顯示', [{ value: 0, label: '隱藏全部（保留力資料）' }, { value: 1, label: '顯示自訂力' }]),
            control('incline', '斜面角度', 0, 55, 1, '°')
        ],
        {
            sanitize: function (source) {
                var incoming = source && typeof source === 'object' ? source : {};
                var rawForces;
                if (Array.isArray(incoming.forces)) rawForces = incoming.forces;
                else rawForces = [
                    { id: 'gravity', label: 'mg', magnitude: clamp(incoming.weight, 0, 180, 88), mode: 'vertical', direction: 1, angle: -90 },
                    { id: 'normal', label: 'N', magnitude: clamp(incoming.normal, 0, 180, 76), mode: 'normal', direction: 1, angle: 115 },
                    { id: 'friction', label: 'f', magnitude: Math.abs(clamp(incoming.friction, -180, 180, -48)), mode: 'tangent', direction: number(incoming.friction, -48) < 0 ? -1 : 1, angle: 25 },
                    { id: 'applied', label: 'F', magnitude: clamp(incoming.applied, 0, 180, 66), mode: 'free', direction: 1, angle: incoming.appliedAngle },
                    { id: 'tension', label: 'T', magnitude: clamp(incoming.tension, 0, 180, 58), mode: 'free', direction: 1, angle: incoming.tensionAngle }
                ];
                var usedIds = {};
                return {
                    schemaVersion: 2,
                    incline: Math.round(clamp(incoming.incline, 0, 55, 25)),
                    bodyKind: Math.round(clamp(incoming.bodyKind, 0, 2, 0)),
                    showBodyLabel: Math.round(clamp(incoming.showBodyLabel, 0, 1, 1)),
                    showSurface: Math.round(clamp(incoming.showSurface, 0, 1, 1)),
                    showForces: Math.round(clamp(incoming.showForces, 0, 1, 1)),
                    forces: rawForces.slice(0, 12).map(function (force, index) { return sanitizeFreeBodyForce(force, index, usedIds); })
                };
            },
            getControls: function (item) {
                var p = params('freeBodyDiagram', item);
                // Hidden surface geometry still constrains normal/tangent forces.
                return freeBodyParametric.controls.filter(function (c) { return c.key !== 'incline' || p.showSurface || p.forces.some(function (f) { return f.mode === 'normal' || f.mode === 'tangent'; }); });
            },
            bounds: function (item) {
                var state = freeBodyState(item);
                var points = [
                    { x: -38, y: -30 }, { x: 38, y: 30 }
                ];
                if (state.p.bodyKind === 0) points = points.concat(state.bodyCorners);
                if (state.p.showSurface) points.push(state.surfaceStart, state.surfaceEnd, state.slopeHandle);
                if (state.p.showForces) points = points.concat(state.forces.map(function (entry) { return entry.tip; }));
                return {
                    left: Math.min.apply(null, points.map(function (point) { return point.x; })) - 28,
                    top: Math.min.apply(null, points.map(function (point) { return point.y; })) - 28,
                    right: Math.max.apply(null, points.map(function (point) { return point.x; })) + 28,
                    bottom: Math.max.apply(null, points.map(function (point) { return point.y; })) + 28
                };
            },
            handles: function (item) {
                var state = freeBodyState(item);
                var handles = state.forces.filter(function (entry) { return state.p.showForces && entry.force.magnitude > 1; }).map(function (entry, index) {
                    return { id: 'force:' + entry.force.id, label: entry.force.label, x: entry.tip.x, y: entry.tip.y, primary: index === 0, readout: freeBodyReadout(entry.force) };
                });
                if (state.p.showSurface) handles.push({ id: 'slope', label: '斜面', x: state.slopeHandle.x, y: state.slopeHandle.y, readout: 'θ ' + state.p.incline + '°' });
                return handles;
            },
            update: function (item, id, point) {
                var p = params('freeBodyDiagram', item);
                if (id === 'slope') {
                    if (!p.showSurface) return null;
                    p.incline = clamp(-Math.atan2(point.y, Math.max(1, point.x)) / DEG, 0, 55, p.incline);
                } else if (id.indexOf('force:') === 0) {
                    if (!p.showForces) return null;
                    var forceId = id.slice(6);
                    var force = p.forces.find(function (entry) { return entry.id === forceId; });
                    if (!force) return null;
                    if (force.mode === 'free') {
                        force.magnitude = clamp(Math.hypot(point.x, point.y), 0, 180, force.magnitude);
                        force.angle = freeBodyAngle(point);
                    } else {
                        var unit = freeBodyForceVector({ mode: force.mode, direction: 1, magnitude: 1, angle: force.angle }, p.incline);
                        var projection = point.x * unit.x + point.y * unit.y;
                        force.magnitude = clamp(Math.abs(projection), 0, 180, force.magnitude);
                        if (Math.abs(projection) > 2) force.direction = projection < 0 ? -1 : 1;
                    }
                } else return null;
                item.params = library.sanitizeParams('freeBodyDiagram', p);
                var updatedForce = id.indexOf('force:') === 0 ? item.params.forces.find(function (entry) { return 'force:' + entry.id === id; }) : null;
                return { readout: id === 'slope' ? 'θ ' + Math.round(item.params.incline) + '°' : freeBodyReadout(updatedForce) };
            }
        }
    );

    add('mechanics', 'freeBodyDiagram', '自由體受力圖', 300, 280, function (ctx, item) {
        var state = freeBodyState(item);
        var p = state.p;
        if (p.bodyKind === 0) {
            begin(ctx);
            state.bodyCorners.forEach(function (point, index) {
                if (index === 0) ctx.moveTo(point.x, point.y);
                else ctx.lineTo(point.x, point.y);
            });
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }
        else if (p.bodyKind === 1) dot(ctx, 0, 0, 4);
        else circle(ctx, 0, 0, 26, true);
        if (p.showBodyLabel) text(ctx, 'm', p.bodyKind === 1 ? 13 : 0, p.bodyKind === 1 ? 14 : -13, 16);

        function drawForce(tip, label) {
            if (Math.hypot(tip.x, tip.y) < 2) return;
            arrow(ctx, 0, 0, tip.x, tip.y, 9);
            var length = Math.max(1, Math.hypot(tip.x, tip.y));
            var offsetX = -tip.y / length * 13;
            var offsetY = tip.x / length * 13;
            text(ctx, label, tip.x + offsetX, tip.y + offsetY, 15);
        }

        if (p.showForces) state.forces.forEach(function (entry) { drawForce(entry.tip, entry.force.label); });
        if (p.showSurface) {
            dashed(ctx, [[state.surfaceStart.x, state.surfaceStart.y], [state.surfaceEnd.x, state.surfaceEnd.y]]);
            // Measure the incline from a horizontal ray at the foot of the slope.
            var foot = state.surfaceStart;
            var angle = p.incline * DEG;
            dashed(ctx, [[foot.x, foot.y], [foot.x + 78, foot.y]]);
            if (p.incline > 0) {
                begin(ctx);
                ctx.arc(foot.x, foot.y, 24, -angle, 0);
                ctx.stroke();
            }
            // Very acute angles do not have enough room for a glyph between rays.
            text(ctx, 'θ', foot.x + 52 * Math.cos(angle / 2),
                p.incline < 20 ? foot.y + 13 : foot.y - 52 * Math.sin(angle / 2), 14);
        }
    }, { keywords: ['自由體圖', '受力圖', 'FBD', '重力', '正向力', '摩擦力', '外力', '張力'], modelNote: '可選木塊、質點或圓形物體，關閉斜面參考線，並自訂 0～12 支力。箭長為示意，不會自動求平衡或添加額外的「合力」。隱藏斜面不會解除沿斜面／法向約束，角度仍可在右側設定。力皆自同一受力點出發；施力點不同的力矩題請用力矩素材。隱藏力仍保留教師的力清單；發給學生請用 PNG，不用含答案的 JSON。', suppressCommonLabel: true, parametric: freeBodyParametric });

    function circularMotionState(item) {
        var p = params('circularMotion', item); var theta = p.position * DEG;
        var radial = { x: Math.cos(theta), y: -Math.sin(theta) };
        var tangent = { x: -Math.sin(theta) * p.direction, y: -Math.cos(theta) * p.direction };
        var body = { x: radial.x * p.radius, y: radial.y * p.radius };
        return { p: p, radial: radial, tangent: tangent, body: body,
            velocity: { x: body.x + tangent.x * p.speed, y: body.y + tangent.y * p.speed },
            acceleration: { x: radial.x * 13, y: radial.y * 13 },
            showVelocity: p.vectorMode === 0 || p.vectorMode === 1,
            showAcceleration: p.vectorMode === 0 || p.vectorMode === 2 };
    }

    var circularMotionParametric = smart(
        { radius: 72, speed: 55, position: 0, direction: 1, vectorMode: 0, showRadius: 1 },
        [control('radius', '軌道半徑（圖上）', 35, 170, 1, 'px'), control('position', '位置角（右方為 0°，逆時針為正）', -180, 180, 1, '°'), choice('direction', '運動方向', [{ value: 1, label: '逆時針' }, { value: -1, label: '順時針' }]), choice('vectorMode', '向量顯示', [{ value: 0, label: '速度與向心加速度' }, { value: 1, label: '只給速度（補畫向心加速度）' }, { value: 2, label: '只給向心加速度' }, { value: 3, label: '都不顯示（需另附運動題設）' }]), control('speed', '速度箭長（非數值速率）', 25, 100, 1, 'px'), choice('showRadius', '半徑輔助線', [{ value: 0, label: '隱藏' }, { value: 1, label: '顯示' }])],
        {
            getControls: function (item) { var s = circularMotionState(item); return circularMotionParametric.controls.filter(function (c) { return (c.key !== 'speed' && c.key !== 'direction') || s.showVelocity; }); },
            bounds: function (item) {
                var s = circularMotionState(item); var r = s.p.radius; var v = s.showVelocity ? s.velocity : { x: 0, y: 0 };
                return { left: Math.min(-r, v.x) - 32, top: Math.min(-r, v.y) - 32, right: Math.max(r, v.x) + 32, bottom: Math.max(r, v.y) + 32 };
            },
            handles: function (item) {
                var s = circularMotionState(item);
                var handles = [{ id: 'position', label: '圓上位置（固定半徑）', x: s.body.x, y: s.body.y, primary: true, readout: 'θ ' + s.p.position + '°' }, { id: 'radius', label: '半徑（固定位置角）', x: -s.body.x, y: -s.body.y, readout: 'r ' + s.p.radius + ' px' }];
                if (s.showVelocity) handles.push({ id: 'speed', label: '速度箭長', x: s.velocity.x, y: s.velocity.y, readout: s.p.speed + ' px' });
                return handles;
            },
            update: function (item, id, point) {
                var s = circularMotionState(item); var p = s.p;
                if (id === 'position') { if (Math.hypot(point.x, point.y) < 1) return null; p.position = -Math.atan2(point.y, point.x) / DEG; }
                else if (id === 'radius') p.radius = clamp(-point.x * s.radial.x - point.y * s.radial.y, 35, 170, p.radius);
                else if (id === 'speed' && s.showVelocity) p.speed = clamp((point.x - s.body.x) * s.tangent.x + (point.y - s.body.y) * s.tangent.y, 25, 100, p.speed);
                else return null;
                item.params = library.sanitizeParams('circularMotion', p);
                return { readout: id === 'position' ? 'θ ' + item.params.position + '°' : (id === 'radius' ? 'r ' + item.params.radius + ' px' : '箭長 ' + item.params.speed + ' px') };
            }
        }
    );

    add('mechanics', 'circularMotion', '圓周運動', 190, 190, function (ctx, item) {
        var s = circularMotionState(item); var p = s.p; var b = s.body; var n = s.radial;
        circle(ctx, 0, 0, p.radius, false);
        dot(ctx, 0, 0, 3);
        if (p.showRadius) { stroke(ctx, [[0, 0], [b.x, b.y]]); text(ctx, 'r', b.x / 2 + n.y * 12, b.y / 2 - n.x * 12, 15); }
        circle(ctx, b.x, b.y, 10, true);
        if (s.showVelocity) { arrow(ctx, b.x, b.y, s.velocity.x, s.velocity.y, 8); text(ctx, 'v', s.velocity.x + n.x * 15, s.velocity.y + n.y * 15, 15); }
        if (s.showAcceleration) {
            arrow(ctx, b.x, b.y, s.acceleration.x, s.acceleration.y, 8);
            // Use the portable symbol a; preserve legacy custom labels whose key
            // used a Unicode subscript unsupported by some export fonts.
            var overrides = item.textOverrides || {};
            var accelerationLabel = Object.prototype.hasOwnProperty.call(overrides, 'aₙ') && !Object.prototype.hasOwnProperty.call(overrides, 'a') ? String(overrides['aₙ']) : 'a';
            text(ctx, accelerationLabel, b.x / 2 - n.y * 15, b.y / 2 + n.x * 15, 15);
        }
    }, { keywords: ['圓周運動', '向心力', '向心加速度'], modelNote: '方向示意圖：拖圓上物體只改位置角，對側控制點只改半徑；速度沿切線、向心加速度指向圓心。順逆時針由選單切換，不因拖箭頭反向而偷偷改變。箭長以 px 編排，不代表數值速率，也不據此計算 v²/r。只畫向心分量，不代表非等速圓周運動的全部加速度；不另加一支「向心力」。只給向心加速度不能唯一判定速度方向，需在題幹補充運動方向。', suppressCommonLabel: true, parametric: circularMotionParametric });

    function collisionRightOffset(p, leftVelocity, rightVelocity) {
        var a = -p.separation, b = p.separation;
        return Math.max(Math.min(a, a + leftVelocity), Math.min(b, b + rightVelocity)) <= Math.min(Math.max(a, a + leftVelocity), Math.max(b, b + rightVelocity)) + 12 ? -24 : 0;
    }
    var collisionParametric = smart(
        { separation: 72, leftMass: 2, rightMass: 3, leftSpeed: 52, rightSpeed: -34, leftAfter: -24, rightAfter: 58, collisionMode: 0, solutionMode: 1 },
        [
            control('separation', '左右中心距離的一半', 48, 150, 1, 'px'),
            control('leftMass', '質量 m₁', 1, 20, 1, 'kg'),
            control('rightMass', '質量 m₂', 1, 20, 1, 'kg'),
            control('leftSpeed', '碰撞前 u₁', -90, 90, 1, 'px'),
            control('rightSpeed', '碰撞前 u₂', -90, 90, 1, 'px'),
            control('leftAfter', '碰撞後 v₁', -90, 90, 1, 'px'),
            control('rightAfter', '碰撞後 v₂', -90, 90, 1, 'px'),
            choice('collisionMode', '守恆模式', [{ value: 0, label: '自由繪圖（不求解）' }, { value: 1, label: '完全彈性碰撞' }, { value: 2, label: '完全非彈性碰撞' }]), solutionControl()
        ],
        {
            sanitize: function (source) {
                var incoming = source && typeof source === 'object' ? source : {};
                var output = {
                    separation: Math.round(clamp(incoming.separation, 48, 150, 72)),
                    leftMass: Math.round(clamp(incoming.leftMass, 1, 20, 2)), rightMass: Math.round(clamp(incoming.rightMass, 1, 20, 3)),
                    leftSpeed: Math.round(clamp(incoming.leftSpeed, -90, 90, 52)), rightSpeed: Math.round(clamp(incoming.rightSpeed, -90, 90, -34)),
                    leftAfter: Math.round(clamp(incoming.leftAfter, -90, 90, -24)), rightAfter: Math.round(clamp(incoming.rightAfter, -90, 90, 58)),
                    collisionMode: Math.round(clamp(incoming.collisionMode, 0, 2, 0)), solutionMode: Math.round(clamp(incoming.solutionMode, 0, 1, 1))
                };
                var m1 = output.leftMass; var m2 = output.rightMass; var u1 = output.leftSpeed; var u2 = output.rightSpeed;
                if (output.collisionMode === 1) {
                    output.leftAfter = ((m1 - m2) * u1 + 2 * m2 * u2) / (m1 + m2);
                    output.rightAfter = (2 * m1 * u1 + (m2 - m1) * u2) / (m1 + m2);
                } else if (output.collisionMode === 2) {
                    output.leftAfter = output.rightAfter = (m1 * u1 + m2 * u2) / (m1 + m2);
                }
                return output;
            },
            getControls: function (item) { var p = params('collisionDiagram', item); return collisionParametric.controls.filter(function (c) { return !['leftAfter', 'rightAfter'].includes(c.key) || (!p.collisionMode && p.solutionMode); }); },
            bounds: function (item) {
                var p = params('collisionDiagram', item);
                var furthest = Math.max(
                    Math.abs(-p.separation + p.leftSpeed), Math.abs(p.separation + p.rightSpeed),
                    p.solutionMode ? Math.abs(-p.separation + p.leftAfter) : 0, p.solutionMode ? Math.abs(p.separation + p.rightAfter) : 0,
                    p.separation + 30, 186
                );
                return { left: -furthest - 26, top: -126, right: furthest + 26, bottom: 112 };
            },
            handles: function (item) {
                var p = params('collisionDiagram', item);
                var handles = [
                    { id: 'u1', label: 'u₁', x: -p.separation + p.leftSpeed, y: -78, primary: true, readout: 'u₁ ' + p.leftSpeed },
                    { id: 'u2', label: 'u₂', x: p.separation + p.rightSpeed, y: -78 + collisionRightOffset(p, p.leftSpeed, p.rightSpeed), readout: 'u₂ ' + p.rightSpeed }
                ];
                if (!p.collisionMode && p.solutionMode) handles.push({ id: 'v1', label: '碰後左速度', x: -p.separation + p.leftAfter, y: 38, readout: String(p.leftAfter) }, { id: 'v2', label: '碰後右速度', x: p.separation + p.rightAfter, y: 38 + collisionRightOffset(p, p.leftAfter, p.rightAfter), readout: String(p.rightAfter) });
                return handles;
            },
            update: function (item, id, point) {
                var p = params('collisionDiagram', item); var mapping = { u1: 'leftSpeed', u2: 'rightSpeed', v1: 'leftAfter', v2: 'rightAfter' };
                if (!mapping[id]) return null;
                if ((id === 'v1' || id === 'v2') && (p.collisionMode || !p.solutionMode)) return null;
                if (id === 'u1' || id === 'v1') p[mapping[id]] = point.x + p.separation;
                else p[mapping[id]] = point.x - p.separation;
                item.params = library.sanitizeParams('collisionDiagram', p);
                return { readout: id + ' ' + item.params[mapping[id]] };
            }
        }
    );
    add('mechanics', 'collisionDiagram', '碰撞前後圖', 390, 230, function (ctx, item) {
        var p = params('collisionDiagram', item);
        function drawState(y, title, leftVelocity, rightVelocity, leftLabel, rightLabel, joined) {
            stroke(ctx, [[-180, y + 33], [180, y + 33]]);
            text(ctx, title, -176, y - 39, 13, 'left');
            drawBlock(ctx, joined ? -27 : -p.separation, y + 10, 54, 44, 'm₁');
            drawBlock(ctx, joined ? 27 : p.separation, y + 10, 54, 44, 'm₂');
            if (joined) {
                if (Math.abs(leftVelocity) > 1e-9) arrow(ctx, 0, y - 20, leftVelocity, y - 20, Math.min(8, Math.abs(leftVelocity) / 2));
                text(ctx, leftVelocity === 0 ? 'v = 0（黏合）' : '共同速度 v', leftVelocity / 2, y - 36, 13);
            } else {
                var offset = collisionRightOffset(p, leftVelocity, rightVelocity);
                if (Math.abs(leftVelocity) > 1e-9) arrow(ctx, -p.separation, y - 20, -p.separation + leftVelocity, y - 20, Math.min(8, Math.abs(leftVelocity) / 2));
                if (Math.abs(rightVelocity) > 1e-9) arrow(ctx, p.separation, y - 20 + offset, p.separation + rightVelocity, y - 20 + offset, Math.min(8, Math.abs(rightVelocity) / 2));
                text(ctx, leftLabel + (leftVelocity === 0 ? '=0' : ''), -p.separation + leftVelocity / 2, y - 36, 14);
                text(ctx, rightLabel + (rightVelocity === 0 ? '=0' : ''), p.separation + rightVelocity / 2, y - 36 + offset, 14);
            }
        }
        drawState(-58, '碰撞前', p.leftSpeed, p.rightSpeed, 'u₁', 'u₂');
        if (p.solutionMode && (!p.collisionMode || p.leftSpeed > p.rightSpeed)) drawState(58, '碰撞後', p.leftAfter, p.rightAfter, 'v₁', 'v₂', p.collisionMode === 2);
        else { stroke(ctx, [[-180, 91], [180, 91]]); text(ctx, p.collisionMode && p.leftSpeed <= p.rightSpeed ? '兩物未接近：不產生這次碰撞' : '請補畫碰撞後狀態', 0, 58, 13); }
        text(ctx, 'm₁=' + p.leftMass + ' kg，m₂=' + p.rightMass + ' kg', 0, 0, 12);
    }, { keywords: ['碰撞', '動量守恆', '恢復係數'], modelNote: '一維碰撞前後快照，箭長使用相同比例，正值向右；px 不是 m/s，圖上位置不表示經過相同時間。自由繪圖不保證守恆；兩種求解模式保持完整精度且禁止改碰後答案，須明確切換模式才能自由改圖。左物速度大於右物才會接近；否則不畫虛構碰撞。完全非彈性碰後黏合並共用一支速度箭頭。題目模式隱藏碰後結果，JSON 仍保存答案；不處理外力衝量、旋轉或二維碰撞。', suppressCommonLabel: true, parametric: collisionParametric });

    function torqueState(item) {
        var p = params('torqueDiagram', item);
        var theta = p.angle * DEG;
        var direction = { x: Math.cos(theta), y: -Math.sin(theta) };
        var pivot = { x: 0, y: 0 };
        var application = { x: p.arm, y: 0 };
        var tip = { x: application.x + direction.x * p.force, y: direction.y * p.force };
        var projection = -p.arm * direction.x;
        var actionExtent = Math.max(150, Math.abs(projection) + 18);
        var foot = {
            x: application.x + direction.x * projection,
            y: direction.y * projection
        };
        return {
            p: p,
            theta: theta,
            direction: direction,
            pivot: pivot,
            application: application,
            tip: tip,
            foot: foot,
            lineStart: { x: application.x - direction.x * actionExtent, y: application.y - direction.y * actionExtent },
            lineEnd: { x: application.x + direction.x * actionExtent, y: application.y + direction.y * actionExtent },
            formulaY: Math.max(88, Math.abs(direction.y * actionExtent) + 24, foot.y + 24, tip.y + 24),
            momentArm: Math.abs(p.arm * Math.sin(theta))
        };
    }

    function torqueReadout(state) {
        return 'r ' + Math.round(state.p.arm) + ' · d ' + Math.round(state.momentArm)
            + ' · θ ' + Math.round(state.p.angle) + '°';
    }

    var torqueParametric = smart(
        { arm: 110, angle: 55, force: 72, solutionMode: 1 },
        [control('arm', '作用點距離 r', 45, 190, 1, 'px'), control('angle', 'r 至 F 的有向角', -180, 180, 1, '°'), control('force', '力箭頭長度（僅示意）', 30, 120, 1, 'px'), solutionControl()],
        {
            bounds: function (item) {
                var state = torqueState(item);
                return {
                    left: Math.min(state.pivot.x - 35, state.tip.x, state.foot.x, state.lineStart.x, state.lineEnd.x) - 18,
                    top: Math.min(-42, state.tip.y, state.foot.y, state.lineStart.y, state.lineEnd.y) - 22,
                    right: Math.max(state.application.x + 35, state.tip.x, state.foot.x, state.lineStart.x, state.lineEnd.x) + 18,
                    bottom: state.formulaY + 18
                };
            },
            handles: function (item) {
                var state = torqueState(item);
                var readout = torqueReadout(state);
                return [
                    { id: 'force', label: '施力', x: state.tip.x, y: state.tip.y, primary: true, readout: readout },
                    { id: 'arm', label: '作用點', x: state.application.x, y: 0, readout: readout }
                ];
            },
            update: function (item, id, point) {
                var p = params('torqueDiagram', item);
                if (id === 'arm') p.arm = clamp(point.x, 45, 190, p.arm);
                else if (id === 'force') {
                    var dx = point.x - p.arm;
                    p.force = clamp(Math.hypot(dx, point.y), 30, 120, p.force);
                    p.angle = clamp(-Math.atan2(point.y, dx) / DEG, -180, 180, p.angle);
                } else return null;
                item.params = library.sanitizeParams('torqueDiagram', p);
                return { readout: torqueReadout(torqueState(item)) };
            }
        }
    );
    add('mechanics', 'torqueDiagram', '力矩與力臂', 340, 230, function (ctx, item) {
        var state = torqueState(item);
        var pivot = state.pivot;
        var application = state.application;

        /* Rod, pivot O and force application point A. */
        stroke(ctx, [[pivot.x - 26, 0], [application.x + 24, 0]]);
        circle(ctx, pivot.x, 0, 5, true);
        filledPath(ctx, [[pivot.x, 5], [pivot.x - 15, 29], [pivot.x + 15, 29]]);
        stroke(ctx, [[pivot.x - 22, 29], [pivot.x + 22, 29]]);
        dot(ctx, application.x, application.y, 4);
        text(ctx, 'O', pivot.x, -17, 14);
        text(ctx, 'A', application.x, 17, 14);

        /* Applied force and its complete line of action. */
        if (state.p.solutionMode) dashed(ctx, [[state.lineStart.x, state.lineStart.y], [state.lineEnd.x, state.lineEnd.y]]);
        arrow(ctx, state.application.x, state.application.y, state.tip.x, state.tip.y, 9);
        text(ctx, 'F', state.tip.x + 11, state.tip.y - 2, 15);

        /* Radius r is measured from O to A. */
        stroke(ctx, [[pivot.x, 34], [pivot.x, 55]]);
        stroke(ctx, [[application.x, 25], [application.x, 55]]);
        arrow(ctx, pivot.x, 48, application.x, 48, 6, true);
        text(ctx, 'r', (pivot.x + application.x) / 2, 63, 15);

        /* Moment arm d is the perpendicular distance from O to the force line. */
        if (state.p.solutionMode) {
        dashed(ctx, [[pivot.x, pivot.y], [state.foot.x, state.foot.y]]);
        var dLength = Math.max(1, state.momentArm);
        var dUnit = { x: (pivot.x - state.foot.x) / dLength, y: (pivot.y - state.foot.y) / dLength };
        var labelOffset = { x: -dUnit.y * 13, y: dUnit.x * 13 };
        if (state.momentArm < 18) text(ctx, state.momentArm < 1e-6 ? 'd = 0' : 'd', pivot.x - 22, -35, 15);
        else text(ctx, 'd', (pivot.x + state.foot.x) / 2 + labelOffset.x, (pivot.y + state.foot.y) / 2 + labelOffset.y, 15);

        var cornerA = { x: state.foot.x + state.direction.x * 9, y: state.foot.y + state.direction.y * 9 };
        var cornerB = { x: cornerA.x + dUnit.x * 9, y: cornerA.y + dUnit.y * 9 };
        var cornerC = { x: state.foot.x + dUnit.x * 9, y: state.foot.y + dUnit.y * 9 };
        if (state.momentArm > 1) stroke(ctx, [[cornerA.x, cornerA.y], [cornerB.x, cornerB.y], [cornerC.x, cornerC.y]]);
        }

        /* θ is explicitly the included angle between r and F. */
        stroke(ctx, [[application.x, 0], [application.x + 38, 0]]);
        begin(ctx);
        ctx.arc(application.x, 0, 25, 0, -state.theta, state.theta >= 0);
        ctx.stroke();
        text(ctx, state.p.angle ? 'θ' : 'θ = 0°', application.x + Math.cos(-state.theta / 2) * 38, state.p.angle ? Math.sin(-state.theta / 2) * 38 : -18, 14);
        if (state.p.solutionMode) text(ctx, 'τ = rF sinθ；|τ| = Fd', state.p.arm / 2, state.formulaY, 14);
    }, { keywords: ['力矩', '轉矩', '力臂'], suppressCommonLabel: true, parametric: torqueParametric });

    var centerOfMassParametric = smart(
        { separation: 120, leftPosition: null, rightPosition: null, leftMass: 2, rightMass: 5, showCenter: 1, showDistance: 0 },
        [control('leftPosition', '左質量位置（圖上）', -250, 190, 0.5, 'px'), control('rightPosition', '右質量位置（圖上）', -190, 250, 0.5, 'px'), control('leftMass', '左質量（基準質量 m 的倍數）', 1, 10, 0.1, '倍'), control('rightMass', '右質量（基準質量 m 的倍數）', 1, 10, 0.1, '倍'), choice('showCenter', '質心答案', [{ value: 0, label: '隱藏（題目）' }, { value: 1, label: '顯示（解答）' }]), choice('showDistance', '兩質量間距標示 d', [{ value: 0, label: '隱藏' }, { value: 1, label: '顯示（可在圖中文字改名）' }])],
        {
            sanitize: function (source) {
                var incoming = source || {}; var separation = clamp(incoming.separation, 60, 250, 120);
                var left = Math.round(clamp(incoming.leftPosition == null ? -separation / 2 : incoming.leftPosition, -250, 190, -separation / 2) * 2) / 2;
                var right = Math.round(clamp(incoming.rightPosition == null ? separation / 2 : incoming.rightPosition, left + 60, 250, separation / 2) * 2) / 2;
                return { leftPosition: left, rightPosition: right, separation: right - left,
                    leftMass: Math.round(clamp(incoming.leftMass, 1, 10, 2) * 10) / 10, rightMass: Math.round(clamp(incoming.rightMass, 1, 10, 5) * 10) / 10,
                    showCenter: Math.round(clamp(incoming.showCenter, 0, 1, 1)), showDistance: Math.round(clamp(incoming.showDistance, 0, 1, 0)) };
            },
            getControls: function (item) {
                var p = params('centerOfMassSystem', item);
                return centerOfMassParametric.controls.map(function (c) {
                    if (c.key === 'leftPosition') return Object.assign({}, c, { max: p.rightPosition - 60 });
                    if (c.key === 'rightPosition') return Object.assign({}, c, { min: p.leftPosition + 60 });
                    return c;
                });
            },
            bounds: function (item) { var p = params('centerOfMassSystem', item); return { left: p.leftPosition - 34, right: p.rightPosition + 34, top: p.showDistance ? -82 : -44, bottom: 60 }; },
            handles: function (item) { var p = params('centerOfMassSystem', item); return [{ id: 'left', label: '左質量（右側固定）', x: p.leftPosition, y: 0, primary: true, readout: 'x ' + p.leftPosition + ' px' }, { id: 'right', label: '右質量（左側固定）', x: p.rightPosition, y: 0, readout: 'x ' + p.rightPosition + ' px' }]; },
            update: function (item, id, point) {
                if (id !== 'left' && id !== 'right') return null;
                var p = params('centerOfMassSystem', item);
                if (id === 'left') p.leftPosition = clamp(point.x, -250, p.rightPosition - 60, p.leftPosition);
                else p.rightPosition = clamp(point.x, p.leftPosition + 60, 250, p.rightPosition);
                item.params = library.sanitizeParams('centerOfMassSystem', p);
                return { readout: '圖上間距 ' + item.params.separation + ' px（另一質量固定）' };
            }
        }
    );
    add('mechanics', 'centerOfMassSystem', '質心系統', 330, 100, function (ctx, item) {
        var p = params('centerOfMassSystem', item);
        var left = p.leftPosition;
        var right = p.rightPosition;
        var center = (p.leftMass * left + p.rightMass * right) / (p.leftMass + p.rightMass);
        stroke(ctx, [[left, 0], [right, 0]]);
        circle(ctx, left, 0, 7 + Math.sqrt(p.leftMass) * 3.1, true);
        circle(ctx, right, 0, 7 + Math.sqrt(p.rightMass) * 3.1, true);
        text(ctx, p.leftMass + 'm', left, -28, 14);
        text(ctx, p.rightMass + 'm', right, -28, 14);
        if (p.showCenter) {
            dot(ctx, center, 0, 3.5);
            dashed(ctx, [[center, 0], [center, 30]]);
            text(ctx, 'CM', center, 44, 13);
        }
        if (p.showDistance) {
            stroke(ctx, [[left, -40], [left, -64]]); stroke(ctx, [[right, -40], [right, -64]]);
            arrow(ctx, left, -56, right, -56, 6, true);
            text(ctx, 'd', (left + right) / 2, -71, 14);
        }
    }, { keywords: ['質心', '重心', '質量中心'], modelNote: '一維兩質點模型，質心按兩質量與位置的加權平均計算。拖一顆質量時另一顆固定；兩圓為質量的符號，不代表均勻連桿，連線本身不計質量。至少保留 60 px 間距，避免符號重疊；位置欄是圖上座標，不是公尺。質量以共同基準 m 的倍數指定，d 可在圖中文字改成題設長度。CM 黑點位於實際質心，向下引線只用來排開標籤。可隱藏 CM 供學生作答。', suppressCommonLabel: true, parametric: centerOfMassParametric });

    function atwoodState(item) {
        var p = params('atwoodMachine', item);
        return {
            p: p,
            leftRope: p.ropeLength / 2 - p.displacement,
            rightRope: p.ropeLength / 2 + p.displacement
        };
    }

    var atwoodParametric = smart(
        { radius: 34, ropeLength: 250, displacement: 20, leftMass: 2, rightMass: 4 },
        [
            control('radius', '滑輪半徑', 22, 58, 1, 'px'),
            control('ropeLength', '兩側垂直繩長總和', 150, 380, 1, 'px'),
            control('displacement', '右側相對等長位置的位移', -80, 80, 1, 'px'),
            control('leftMass', '左側質量 m₁', 1, 20, 1, 'kg'),
            control('rightMass', '右側質量 m₂', 1, 20, 1, 'kg')
        ],
        {
            sanitize: function (source) {
                var incoming = source && typeof source === 'object' ? source : {};
                var legacyLeft = clamp(incoming.leftRope, 55, 230, 105);
                var legacyRight = clamp(incoming.rightRope, 55, 230, 145);
                var ropeLength = clamp(incoming.ropeLength, 150, 380, legacyLeft + legacyRight);
                var maximumDisplacement = Math.max(0, Math.min(80, ropeLength / 2 - 55));
                var migratedDisplacement = (legacyRight - legacyLeft) / 2;
                return {
                    radius: Math.round(clamp(incoming.radius, 22, 58, 34)),
                    ropeLength: Math.round(ropeLength),
                    displacement: Math.round(clamp(incoming.displacement, -maximumDisplacement, maximumDisplacement, migratedDisplacement)),
                    leftMass: Math.round(clamp(number(incoming.leftMass, 2) > 20 ? 2 : incoming.leftMass, 1, 20, 2)),
                    rightMass: Math.round(clamp(number(incoming.rightMass, 4) > 20 ? 4 : incoming.rightMass, 1, 20, 4))
                };
            },
            bounds: function (item) { var s = atwoodState(item); return { left: -s.p.radius - 52, top: -s.p.radius - 38, right: s.p.radius + 52, bottom: Math.max(s.leftRope, s.rightRope) + 64 }; },
            handles: function (item) { var s = atwoodState(item); return [{ id: 'left', label: '左砝碼', x: -s.p.radius, y: s.leftRope + 21, primary: true, readout: '繩長 ' + Math.round(s.leftRope) + ' · ' + Math.round(s.rightRope) }, { id: 'right', label: '右砝碼', x: s.p.radius, y: s.rightRope + 21, readout: '繩長 ' + Math.round(s.leftRope) + ' · ' + Math.round(s.rightRope) }]; },
            update: function (item, id, point) {
                var p = params('atwoodMachine', item);
                if (id === 'left') p.displacement = p.ropeLength / 2 - (point.y - 21);
                else if (id === 'right') p.displacement = point.y - 21 - p.ropeLength / 2;
                else return null;
                item.params = library.sanitizeParams('atwoodMachine', p);
                var state = atwoodState(item);
                return { readout: 'y₁ ' + Math.round(state.leftRope) + ' · y₂ ' + Math.round(state.rightRope) };
            }
        }
    );
    add('mechanics', 'atwoodMachine', '阿特伍德機', 190, 270, function (ctx, item) {
        var s = atwoodState(item); var p = s.p;
        var massWidth = Math.min(54, 2 * p.radius - 10); var massHeight = 42;
        stroke(ctx, [[0, -p.radius - 32], [0, -p.radius]]);
        circle(ctx, 0, 0, p.radius, true);
        circle(ctx, 0, 0, 4, true);
        stroke(ctx, [[-p.radius, 0], [-p.radius, s.leftRope]]);
        stroke(ctx, [[p.radius, 0], [p.radius, s.rightRope]]);
        drawBlock(ctx, -p.radius, s.leftRope + massHeight / 2, massWidth, massHeight, 'm₁');
        drawBlock(ctx, p.radius, s.rightRope + massHeight / 2, massWidth, massHeight, 'm₂');
        text(ctx, p.leftMass + ' kg', -p.radius, s.leftRope + 55, 11);
        text(ctx, p.rightMass + ' kg', p.radius, s.rightRope + 55, 11);
    }, { keywords: ['阿特伍德機', '雙砝碼', '滑輪系統'], suppressCommonLabel: true, parametric: atwoodParametric });

    function springOscillatorState(item) {
        var p = params('springOscillator', item); var wall = -145;
        return { p: p, wall: wall, equilibrium: wall + p.length, end: wall + p.length + p.amplitude,
            center: wall + p.length + p.amplitude + p.mass / 2 };
    }
    var springOscillatorParametric = smart(
        { length: 130, amplitude: 44, mass: 52, geometryVersion: null, showReference: 1, showForce: 0 },
        [control('length', '平衡彈簧長（自牆面量起）', 75, 300, 1, 'px'), control('amplitude', '相對平衡位置的位移（右為正）', -80, 80, 1, 'px'), control('mass', '物塊寬度（非質量數值）', 34, 80, 1, 'px'), choice('showReference', '平衡位置與位移標示', [{ value: 0, label: '隱藏' }, { value: 1, label: '顯示' }]), choice('showForce', '回復力方向（示意）', [{ value: 0, label: '隱藏（可供學生作答）' }, { value: 1, label: '顯示' }])],
        {
            sanitize: function (source) {
                var incoming = source && typeof source === 'object' ? source : {};
                // The old length started 25 px to the right of the actual wall.
                // Migrate once without moving an existing block or zero marker.
                var legacy = incoming.geometryVersion !== 2;
                var length = Math.round(legacy ? clamp(incoming.length, 75, 220, 130) + 25 : clamp(incoming.length, 75, 300, 155));
                var amplitude = Math.round(clamp(incoming.amplitude, Math.max(-80, 70 - length), 80, 44));
                return { length: length, amplitude: amplitude, mass: Math.round(clamp(incoming.mass, 34, 80, 52)), geometryVersion: 2,
                    showReference: Math.round(clamp(incoming.showReference, 0, 1, 1)), showForce: Math.round(clamp(incoming.showForce, 0, 1, 0)) };
            },
            getControls: function (item) {
                var p = params('springOscillator', item);
                return springOscillatorParametric.controls.map(function (c) {
                    if (c.key === 'amplitude') return Object.assign({}, c, { min: Math.max(-80, 70 - p.length) });
                    if (c.key === 'length') return Object.assign({}, c, { min: Math.max(75, 70 - p.amplitude) });
                    return c;
                });
            },
            bounds: function (item) {
                var s = springOscillatorState(item);
                var forceEnd = s.center - Math.sign(s.p.amplitude) * Math.max(16, Math.min(64, Math.abs(s.p.amplitude) * 0.8));
                return { left: -168, top: -76, right: Math.max(s.end + s.p.mass, s.p.showReference ? s.equilibrium + 20 : s.end + s.p.mass, s.p.showForce ? forceEnd + 20 : s.end + s.p.mass) + 22, bottom: 90 };
            },
            handles: function (item) {
                var s = springOscillatorState(item);
                return [{ id: 'block', label: '位移（牆面與平衡位置固定）', x: s.center, y: 0, primary: true, readout: 'x ' + s.p.amplitude + ' px' }];
            },
            update: function (item, id, point) {
                if (id !== 'block') return null;
                var s = springOscillatorState(item); var p = s.p;
                p.amplitude = clamp(point.x - p.mass / 2 - s.equilibrium, -80, 80, p.amplitude);
                item.params = library.sanitizeParams('springOscillator', p);
                return { readout: 'x ' + Math.round(item.params.amplitude) + ' px' };
            }
        }
    );
    add('mechanics', 'springOscillator', '彈簧振子', 360, 130, function (ctx, item) {
        var s = springOscillatorState(item); var p = s.p; var end = s.end;
        stroke(ctx, [[s.wall, -42], [s.wall, 42]]);
        for (var y = -36; y <= 36; y += 12) stroke(ctx, [[-157, y + 8], [-145, y]]);
        var points = [[s.wall, 0], [s.wall + 15, 0]];
        for (var i = 0; i <= 10; i += 1) points.push([s.wall + 15 + (end - s.wall - 30) * i / 10, i === 0 || i === 10 ? 0 : (i % 2 ? -13 : 13)]);
        points.push([end, 0]);
        stroke(ctx, points);
        drawBlock(ctx, s.center, 0, p.mass, 48, 'm');
        if (p.showReference) {
            // Reference only outside the block: never run a zero line through m.
            dashed(ctx, [[s.equilibrium, -56], [s.equilibrium, -28]]);
            dashed(ctx, [[s.equilibrium, 28], [s.equilibrium, 57]]);
            text(ctx, '平衡', s.equilibrium, -66, 12);
            if (p.amplitude !== 0) { arrow(ctx, s.equilibrium, 52, end, 52, Math.min(7, Math.abs(p.amplitude) * 0.45)); text(ctx, 'x', (s.equilibrium + end) / 2, 73, 14); }
            else text(ctx, 'x = 0', s.equilibrium, 73, 14);
        }
        if (p.showForce) {
            if (p.amplitude === 0) text(ctx, 'F = 0', s.center, -40, 14);
            else {
                var forceLength = Math.max(16, Math.min(64, Math.abs(p.amplitude) * 0.8));
                var forceEnd = s.center - Math.sign(p.amplitude) * forceLength;
                arrow(ctx, s.center, -40, forceEnd, -40, 7);
                text(ctx, 'F', forceEnd - Math.sign(p.amplitude) * 12, -40, 14);
            }
        }
    }, { keywords: ['彈簧振子', '簡諧運動', 'SHM'], modelNote: '水平理想彈簧振子示意；牆面固定，平衡彈簧長從牆面到物塊左側接點量起，位移向右為正。拖物塊只改位移，右側改平衡長度則保持位移。平衡時顯示 x=0，不畫零長箭頭；回復力可隱藏，零位移時為零。箭長與物塊寬度只供排圖，不是力或質量的數值；未模擬振盪、阻尼或垂直彈簧的重力平衡。彈簧至少留 70 px，避免壓縮穿牆或線圈糊成黑塊。', suppressCommonLabel: true, parametric: springOscillatorParametric });

    function orbitVelocity(p) {
        var r = p.position * DEG; var x = p.major * Math.cos(r); var y = p.minor * Math.sin(r);
        var focus = Math.sqrt(Math.max(0, p.major * p.major - p.minor * p.minor));
        var tx = -p.major * Math.sin(r); var ty = p.minor * Math.cos(r); var norm = Math.max(1, Math.hypot(tx, ty));
        var speed = clamp(34 * Math.sqrt(Math.max(0.05, 2 * p.major / Math.max(1, Math.hypot(x + focus, y)) - 1)), 28, 72, 42);
        return { x: x, y: y, dx: p.direction * tx / norm, dy: p.direction * ty / norm, length: speed };
    }
    var orbitParametric = smart(
        { major: 115, minor: 74, position: 35, direction: 1, showVelocity: 1 },
        [choice('direction', '繞行方向', [{ value: 1, label: '順時針' }, { value: -1, label: '逆時針' }]), choice('showVelocity', '速度箭頭', [{ value: 0, label: '隱藏（題目）' }, { value: 1, label: '顯示' }]), control('major', '長半軸', 65, 210, 1, 'px'), control('minor', '短半軸', 40, 170, 1, 'px'), control('position', '衛星位置', 0, 360, 1, '°')],
        {
            sanitize: function (source) {
                var incoming = source && typeof source === 'object' ? source : {};
                var major = clamp(incoming.major, 65, 210, 115);
                return {
                    major: Math.round(major),
                    minor: Math.round(clamp(incoming.minor, 40, Math.min(170, major), Math.min(74, major))),
                    position: Math.round(clamp(incoming.position, 0, 360, 35)),
                    direction: incoming.direction === -1 ? -1 : 1,
                    showVelocity: incoming.showVelocity === 0 ? 0 : 1
                };
            },
            bounds: function (item) { var p = params('orbitDiagram', item); var v = orbitVelocity(p); var x = v.x + (v.length + 12) * v.dx; var y = v.y + (v.length + 12) * v.dy; return { left: Math.min(-p.major - 22, p.showVelocity ? x - 12 : 0), top: Math.min(-p.minor - 22, p.showVelocity ? y - 12 : 0), right: Math.max(p.major + 22, p.showVelocity ? x + 12 : 0), bottom: Math.max(p.minor + 22, p.showVelocity ? y + 12 : 0) }; },
            handles: function (item) { var p = params('orbitDiagram', item); var r = p.position * DEG; return [{ id: 'satellite', label: '衛星', x: p.major * Math.cos(r), y: p.minor * Math.sin(r), primary: true, readout: '位置 ' + p.position + '°' }]; },
            update: function (item, id, point) {
                if (id !== 'satellite') return null;
                var p = params('orbitDiagram', item);
                p.position = Math.atan2(point.y / p.minor, point.x / p.major) / DEG;
                if (p.position < 0) p.position += 360;
                item.params = library.sanitizeParams('orbitDiagram', p);
                return { readout: '位置 ' + Math.round(item.params.position) + '°' };
            }
        }
    );
    add('mechanics', 'orbitDiagram', '行星與衛星軌道', 280, 210, function (ctx, item) {
        var p = params('orbitDiagram', item);
        var r = p.position * DEG;
        begin(ctx);
        ctx.ellipse(0, 0, p.major, p.minor, 0, 0, Math.PI * 2);
        ctx.stroke();
        var focus = Math.sqrt(Math.max(0, p.major * p.major - p.minor * p.minor));
        var x = p.major * Math.cos(r);
        var y = p.minor * Math.sin(r);
        // Symbol sizes depend on the whole orbit, never on the current phase.
        var periapsis = p.major - focus;
        var symbolScale = Math.min(1, periapsis / 34);
        var centralRadius = 15 * symbolScale;
        ctx.save();
        ctx.lineWidth = Math.min(ctx.lineWidth, periapsis / 12);
        circle(ctx, -focus, 0, centralRadius, true);
        circle(ctx, x, y, 9 * symbolScale, true);
        ctx.restore();
        text(ctx, 'M', centralRadius >= 11 ? -focus : -focus + centralRadius + 13, 0, 15);
        if (p.showVelocity) {
            var v = orbitVelocity(p);
            arrow(ctx, x, y, x + v.length * v.dx, y + v.length * v.dy, 7);
            text(ctx, 'v', x + (v.length + 12) * v.dx, y + (v.length + 12) * v.dy, 14);
        }
    }, { keywords: ['軌道', '克卜勒', '衛星', '萬有引力'], suppressCommonLabel: true, parametric: orbitParametric });

    var conicalPendulumParametric = smart(
        { length: 115, angle: 28, bobRadius: 12, lockLength: 1, side: 1, showAngle: 1 },
        [control('length', '繩長（圖上）', 65, 190, 1, 'px'), control('angle', '與鉛直夾角', 0, 65, 1, '°'), control('bobRadius', '擺錘符號半徑', 7, 24, 1, 'px'), choice('lockLength', '拖曳擺錘', [{ value: 1, label: '固定繩長，只改角度' }, { value: 0, label: '同時調整繩長與角度' }]), choice('side', '擺錘位置', [{ value: 1, label: '圓周右端' }, { value: -1, label: '圓周左端' }]), choice('showAngle', '角度輔助線', [{ value: 0, label: '隱藏' }, { value: 1, label: '顯示' }])],
        {
            bounds: function (item) {
                var p = params('conicalPendulum', item); var radians = p.angle * DEG;
                var radius = p.length * Math.sin(radians); var y = -65 + p.length * Math.cos(radians); var orbitHeight = radius * 0.28;
                return { left: Math.min(-53, -radius - p.bobRadius - 14), top: Math.min(-88, y - orbitHeight - p.bobRadius - 8), right: Math.max(53, radius + p.bobRadius + 14), bottom: y + orbitHeight + p.bobRadius + 12 };
            },
            handles: function (item) { var p = params('conicalPendulum', item); var r = p.angle * DEG; return [{ id: 'bob', label: p.lockLength ? '擺角（繩長固定）' : '擺錘', x: p.side * p.length * Math.sin(r), y: -65 + p.length * Math.cos(r), primary: true, readout: 'L ' + p.length + ' · θ ' + p.angle + '°' }]; },
            update: function (item, id, point) {
                if (id !== 'bob') return null;
                var dy = point.y + 65;
                var p = params('conicalPendulum', item);
                if (!p.lockLength) p.length = clamp(Math.hypot(point.x, dy), 65, 190, p.length);
                p.angle = clamp(Math.atan2(Math.max(0, p.side * point.x), Math.max(0, dy)) / DEG, 0, 65, p.angle);
                item.params = library.sanitizeParams('conicalPendulum', p);
                return { readout: 'L ' + Math.round(item.params.length) + ' · θ ' + Math.round(item.params.angle) + '°' };
            }
        }
    );
    add('mechanics', 'conicalPendulum', '圓錐擺', 280, 260, function (ctx, item) {
        var p = params('conicalPendulum', item);
        var r = p.angle * DEG;
        var x = p.side * p.length * Math.sin(r);
        var y = -65 + p.length * Math.cos(r);
        stroke(ctx, [[-45, -65], [45, -65]]);
        stroke(ctx, [[0, -65], [x, y]]);
        if (p.showAngle) { dashed(ctx, [[0, -65], [0, y]]); if (p.angle) { begin(ctx); ctx.arc(0, -65, 27, Math.PI / 2 - Math.max(0, p.side) * r, Math.PI / 2 + Math.max(0, -p.side) * r); ctx.stroke(); } }
        if (p.angle) { begin(ctx); ctx.ellipse(0, y, Math.abs(x), Math.abs(x) * 0.28, 0, 0, Math.PI * 2); ctx.stroke(); }
        circle(ctx, x, y, p.bobRadius, true);
        if (p.showAngle && p.angle) text(ctx, 'θ', p.side * Math.sin(r / 2) * 38, -65 + Math.cos(r / 2) * 38, 14);
    }, { keywords: ['圓錐擺', '水平圓周運動'], modelNote: '水平圓周軌道的斜投影，半徑 r=L sinθ；橢圓不是實際橢圓軌道。預設拖擺錘固定繩長，角度與左右端分開設定。θ=0 表示鉛直極限，不畫假的圓軌道；不由圖示長度求角速度或張力，需由題幹提供單位與條件。', suppressCommonLabel: true, parametric: conicalPendulumParametric });

    /* Electromagnetism: field, induction and charged-particle diagrams. */
    add('electromagnetism', 'positiveCharge', '正電荷', 54, 54, function (ctx, item) {
        var p = params('positiveCharge', item);
        circle(ctx, 0, 0, p.radius, true);
        text(ctx, '+q', 0, 1, Math.max(13, p.radius * 0.75));
    }, { keywords: ['正電荷', '+q', '點電荷'], modelNote: '圓半徑只調符號大小，不是電量或帶電球的實際半徑；圖中文字可自行改成題目所需電量。', suppressCommonLabel: true, parametric: radiusSmart('positiveCharge', 22, 12, 48, '符號半徑') });

    add('electromagnetism', 'negativeCharge', '負電荷', 54, 54, function (ctx, item) {
        var p = params('negativeCharge', item);
        circle(ctx, 0, 0, p.radius, true);
        text(ctx, '−q', 0, 1, Math.max(13, p.radius * 0.75));
    }, { keywords: ['負電荷', '-q', '點電荷'], modelNote: '圓半徑只調符號大小，不是電量或帶電球的實際半徑；圖中文字可自行改成題目所需電量。', suppressCommonLabel: true, parametric: radiusSmart('negativeCharge', 22, 12, 48, '符號半徑') });

    function radialFieldParametric(type) {
        return smart(
            { extent: 92, lines: 8, rings: 2 },
            [control('extent', '場線範圍', 55, 180, 1, 'px'), control('lines', '場線數量', 4, 16, 1, '條'), control('rings', '等位圈數', 0, 5, 1, '圈')],
            {
                bounds: function (item) { var p = params(type, item); return { left: -p.extent - 12, top: -p.extent - 12, right: p.extent + 12, bottom: p.extent + 12 }; },
                handles: function (item) { var p = params(type, item); return [{ id: 'extent', label: '範圍', x: p.extent, y: 0, primary: true, readout: 'R ' + p.extent + ' px' }]; },
                update: function (item, id, point) {
                    if (id !== 'extent') return null;
                    var p = params(type, item);
                    p.extent = clamp(Math.hypot(point.x, point.y), 55, 180, p.extent);
                    item.params = library.sanitizeParams(type, p);
                    return { readout: 'R ' + Math.round(item.params.extent) + ' px' };
                }
            }
        );
    }

    var pointFieldParametric = radialFieldParametric('electricFieldPoint');
    pointFieldParametric.defaults.sign = 1;
    pointFieldParametric.controls.push(choice('sign', '電荷正負', [{ value: 1, label: '正電荷（向外）' }, { value: -1, label: '負電荷（向內）' }]));
    add('electromagnetism', 'electricFieldPoint', '點電荷電場線（正／負）', 210, 210, function (ctx, item) {
        var p = params('electricFieldPoint', item);
        for (var i = 0; i < p.lines; i += 1) {
            var r = i * Math.PI * 2 / p.lines;
            var start = p.sign > 0 ? 18 : p.extent, end = p.sign > 0 ? p.extent : 18;
            arrow(ctx, Math.cos(r) * start, Math.sin(r) * start, Math.cos(r) * end, Math.sin(r) * end, 7);
        }
        ctx.save();
        ctx.setLineDash([5, 5]);
        for (var ring = 1; ring <= p.rings; ring += 1) circle(ctx, 0, 0, 22 + ring * (p.extent - 26) / Math.max(1, p.rings), false);
        ctx.restore();
        circle(ctx, 0, 0, 15, true);
        text(ctx, p.sign > 0 ? '+' : '−', 0, 1, 17);
    }, { keywords: ['電場線', '點電荷', '等位線'], modelNote: '孤立點電荷的徑向電場，正向外、負向內。虛線圓為等位線，但各圈並非等電位差；場線數只調圖的密度，不代表改變電量。', suppressCommonLabel: true, parametric: pointFieldParametric });

    function chargePairParametric(type) {
        return smart(
            { separation: 105, extent: 82, lines: 7 },
            [control('separation', '電荷間距', 60, 210, 1, 'px'), control('extent', '場線範圍', 45, 145, 1, 'px'), control('lines', '場線密度', 4, 11, 1, '級')],
            {
                bounds: function (item) { var p = params(type, item); return { left: -p.separation / 2 - p.extent - 12, top: -p.extent - 20, right: p.separation / 2 + p.extent + 12, bottom: p.extent + 20 }; },
                handles: function (item) { var p = params(type, item); return [{ id: 'right-charge', label: '電荷間距', x: p.separation / 2, y: 0, primary: true, readout: 'd ' + p.separation + ' px' }]; },
                update: function (item, id, point) {
                    if (id !== 'right-charge') return null;
                    var p = params(type, item);
                    p.separation = clamp(Math.abs(point.x) * 2, 60, 210, p.separation);
                    item.params = library.sanitizeParams(type, p);
                    return { readout: 'd ' + Math.round(item.params.separation) + ' px' };
                }
            }
        );
    }

    var dipoleParametric = chargePairParametric('electricDipoleField');
    dipoleParametric.defaults.polarity = 1;
    dipoleParametric.controls.push(choice('polarity', '電荷方向', [{ value: 1, label: '左正、右負' }, { value: -1, label: '左負、右正' }]));
    add('electromagnetism', 'electricDipoleField', '電偶極電場線', 300, 210, function (ctx, item) {
        var p = params('electricDipoleField', item);
        var left = -p.separation / 2;
        var right = p.separation / 2;
        function unit(x, y) {
            var a = Math.max(1, Math.hypot(x - left, y)), b = Math.max(1, Math.hypot(x - right, y));
            var ex = (x - left) / Math.pow(a, 3) - (x - right) / Math.pow(b, 3), ey = y / Math.pow(a, 3) - y / Math.pow(b, 3), m = Math.hypot(ex, ey);
            return { x: ex / m, y: ey / m };
        }
        function trace(fromRight, angle) {
            var sign = fromRight ? -1 : 1, origin = fromRight ? right : left, other = -origin;
            var x = origin + 16 * Math.cos(angle), y = 16 * Math.sin(angle), points = [[x, y]], connected = false;
            for (var k = 0; k < 1600; k++) {
                var u = unit(x, y), mid = unit(x + sign * u.x * .75, y + sign * u.y * .75);
                x += sign * mid.x * 1.5; y += sign * mid.y * 1.5; points.push([x, y]);
                if (Math.hypot(x - other, y) <= 16) { connected = true; break; }
                if (Math.abs(x) >= right + p.extent || Math.abs(y) >= p.extent) break;
            }
            // Negative-charge seeds add only the incoming outside pieces; lines
            // already connecting both charges must not be drawn twice.
            if (fromRight && connected) return;
            points = points.map(function (pt) { return [p.polarity * pt[0], pt[1]]; });
            stroke(ctx, points);
            var index = Math.max(2, Math.floor(points.length * .55)), a = points[index - 2], b = points[index];
            if (fromRight) arrow(ctx, b[0], b[1], a[0], a[1], 4); else arrow(ctx, a[0], a[1], b[0], b[1], 4);
        }
        for (var i = 0; i < p.lines * 2; i++) { trace(false, i * Math.PI / p.lines); trace(true, i * Math.PI / p.lines); }
        circle(ctx, left, 0, 15, true); text(ctx, p.polarity > 0 ? '+' : '−', left, 0, 17);
        circle(ctx, right, 0, 15, true); text(ctx, p.polarity > 0 ? '−' : '+', right, 0, 17);
    }, { keywords: ['電偶極', '異號電荷', '電場線'], modelNote: '等量異號點電荷的電場線，依兩個庫侖場疊加方向積分，包含兩側外部場線；圖邊界只是截取範圍，不是場線終點。箭頭由正指向負，電荷可左右對換。線條密度只為可讀性，不表示不同電量或完整三維通量分布。', suppressCommonLabel: true, parametric: dipoleParametric });

    var likeFieldParametric = chargePairParametric('likeChargeField');
    likeFieldParametric.defaults.sign = 1;
    likeFieldParametric.controls.push(choice('sign', '電荷種類', [{ value: 1, label: '正正電荷' }, { value: -1, label: '負負電荷' }]));
    add('electromagnetism', 'likeChargeField', '同號電荷電場線', 310, 220, function (ctx, item) {
        var p = params('likeChargeField', item);
        var left = -p.separation / 2;
        var right = p.separation / 2;
        function electricField(x, y) {
            var dxLeft = x - left;
            var dxRight = x - right;
            var rLeft = Math.max(10, Math.hypot(dxLeft, y));
            var rRight = Math.max(10, Math.hypot(dxRight, y));
            return {
                x: dxLeft / Math.pow(rLeft, 3) + dxRight / Math.pow(rRight, 3),
                y: y / Math.pow(rLeft, 3) + y / Math.pow(rRight, 3)
            };
        }
        function drawFieldLine(chargeX, angle) {
            var points = [];
            var x = chargeX + Math.cos(angle) * 18;
            var y = Math.sin(angle) * 18;
            points.push([x, y]);
            for (var stepIndex = 0; stepIndex < 1000; stepIndex += 1) {
                var field = electricField(x, y);
                var magnitude = Math.hypot(field.x, field.y);
                if (magnitude < 0.000002 || Math.hypot(x, y) < 9) break;
                var mid = electricField(x + field.x / magnitude * .75, y + field.y / magnitude * .75);
                var midMagnitude = Math.hypot(mid.x, mid.y);
                if (midMagnitude < 0.000002) break;
                var nextX = x + mid.x / midMagnitude * 1.5, nextY = y + mid.y / midMagnitude * 1.5;
                // The symmetry-axis line approaches the null point; it cannot
                // jump through it and turn into an unrelated outgoing line.
                if (Math.hypot(nextX, nextY) < 9) break;
                x = nextX; y = nextY;
                points.push([x, y]);
                if (Math.abs(x) > p.separation / 2 + p.extent || Math.abs(y) > p.extent) break;
            }
            stroke(ctx, points);
            if (points.length > 4) {
                var end = points[points.length - 1];
                var before = points[points.length - 4];
                if (p.sign > 0) arrow(ctx, before[0], before[1], end[0], end[1], 6);
                else arrow(ctx, end[0], end[1], before[0], before[1], 6);
            }
        }
        [-1, 1].forEach(function (side) {
            var chargeX = side < 0 ? left : right;
            for (var i = 0; i < p.lines; i += 1) {
                var seedAngle = Math.PI * 2 * (i + 0.5) / p.lines;
                drawFieldLine(chargeX, side < 0 ? seedAngle : Math.PI - seedAngle);
            }
        });
        circle(ctx, left, 0, 15, true); text(ctx, p.sign > 0 ? '+' : '−', left, 0, 17);
        circle(ctx, right, 0, 15, true); text(ctx, p.sign > 0 ? '+' : '−', right, 0, 17);
        dot(ctx, 0, 0, 3); text(ctx, 'E = 0', 0, 18, 12);
    }, { keywords: ['同號電荷', '電場線', '零場點'], modelNote: '等量同號點電荷的疊加場；中點為零場點。場線沿局部電場方向積分，在零場點附近停止，不穿越奇異方向；邊界外仍有電場。線數為示意密度，未指定不等量電荷或定量電位。', suppressCommonLabel: true, parametric: likeFieldParametric });

    var plateFieldParametric = smart(
        { separation: 118, height: 185, arrows: 7, polarity: 1 },
        [control('separation', '板間距', 65, 220, 1, 'px'), control('height', '極板長度', 90, 300, 1, 'px'), control('arrows', '場線數量', 3, 12, 1, '條'), choice('polarity', '極板方向', [{ value: 1, label: '左正、右負' }, { value: -1, label: '左負、右正' }])],
        {
            bounds: function (item) { var p = params('parallelPlateField', item); return { left: -p.separation / 2 - 30, top: -p.height / 2 - 20, right: p.separation / 2 + 30, bottom: p.height / 2 + 20 }; },
            handles: function (item) { var p = params('parallelPlateField', item); return [{ id: 'right-plate', label: '板間距', x: p.separation / 2, y: 0, primary: true, readout: 'd ' + p.separation + ' px' }, { id: 'height', label: '極板長度', x: -p.separation / 2, y: -p.height / 2, readout: 'h ' + p.height + ' px' }]; },
            update: function (item, id, point) {
                var p = params('parallelPlateField', item);
                if (id === 'right-plate') p.separation = clamp(Math.abs(point.x) * 2, 65, 220, p.separation);
                else if (id === 'height') p.height = clamp(Math.abs(point.y) * 2, 90, 300, p.height);
                else return null;
                item.params = library.sanitizeParams('parallelPlateField', p);
                return { readout: id === 'right-plate' ? 'd ' + Math.round(item.params.separation) : 'h ' + Math.round(item.params.height) };
            }
        }
    );
    add('electromagnetism', 'parallelPlateField', '平行板均勻電場', 180, 230, function (ctx, item) {
        var p = params('parallelPlateField', item);
        var left = -p.separation / 2;
        var right = p.separation / 2;
        ctx.lineWidth *= 2.2;
        stroke(ctx, [[left, -p.height / 2], [left, p.height / 2]]);
        stroke(ctx, [[right, -p.height / 2], [right, p.height / 2]]);
        [-.3, 0, .3].forEach(function (fraction) { text(ctx, p.polarity > 0 ? '+' : '−', left - 16, p.height * fraction, 15); text(ctx, p.polarity > 0 ? '−' : '+', right + 16, p.height * fraction, 15); });
        ctx.lineWidth /= 2.2;
        for (var i = 0; i < p.arrows; i += 1) {
            var y = -p.height * 0.42 + p.height * 0.84 * i / Math.max(1, p.arrows - 1);
            if (p.polarity > 0) arrow(ctx, left + 12, y, right - 12, y, 7);
            else arrow(ctx, right - 12, y, left + 12, y, 7);
        }
    }, { keywords: ['平行板', '均勻電場', '電容器'], modelNote: '忽略邊緣效應的理想平行板內部均勻電場；箭頭由正板指向負板。有限線段只是排圖範圍，不表示板邊附近仍精確均勻；箭頭數不是電場強度。', suppressCommonLabel: true, parametric: plateFieldParametric });

    var equipotentialParametric = smart(
        { separation: 98, contours: 4, showLabels: 1 },
        [control('separation', '電荷間距', 55, 180, 1, 'px'), control('contours', '等位線層數', 2, 7, 1, '層'), choice('showLabels', '電位提示', [{ value: 0, label: '隱藏（題目）' }, { value: 1, label: '顯示' }])],
        {
            bounds: function (item) { var p = params('equipotentialMap', item); var r = p.separation / 1.2; return { left: -p.separation / 2 - r - 12, top: -r - 42, right: p.separation / 2 + r + 12, bottom: r + 12 }; },
            handles: function (item) { var p = params('equipotentialMap', item); return [{ id: 'positive', label: '正電荷', x: -p.separation / 2, y: 0, primary: true, readout: 'd ' + p.separation }, { id: 'negative', label: '負電荷', x: p.separation / 2, y: 0, readout: 'd ' + p.separation }]; },
            update: function (item, id, point) { if (id !== 'positive' && id !== 'negative') return null; var p = params('equipotentialMap', item); p.separation = Math.abs(point.x) * 2; item.params = library.sanitizeParams('equipotentialMap', p); return { readout: 'd ' + item.params.separation + ' px' }; }
        }
    );
    add('electromagnetism', 'equipotentialMap', '電偶極等位線圖', 300, 220, function (ctx, item) {
        var p = params('equipotentialMap', item);
        var left = -p.separation / 2;
        var right = p.separation / 2;
        var yMin = -p.separation / 1.2;
        var yMax = -yMin;
        function potential(x, y) {
            var rPositive = Math.max(8, Math.hypot(x - left, y));
            var rNegative = Math.max(8, Math.hypot(x - right, y));
            return p.separation * (1 / rPositive - 1 / rNegative);
        }
        function drawContour(level) {
            // Solve each positive contour radially, then reflect for -V.
            // V < d/r guarantees the outer radius brackets every root.
            begin(ctx);
            for (var angle = 0; angle < 240; angle++) {
                var a = angle * Math.PI / 120;
                var low = 0, high = p.separation / Math.abs(level);
                for (var iteration = 0; iteration < 40; iteration++) {
                    var radius = (low + high) / 2;
                    if (potential(left + radius * Math.cos(a), radius * Math.sin(a)) > Math.abs(level)) low = radius;
                    else high = radius;
                }
                var r = (low + high) / 2;
                var x = (left + r * Math.cos(a)) * (level > 0 ? 1 : -1);
                var y = r * Math.sin(a);
                if (!angle) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.closePath(); ctx.stroke();
        }
        ctx.save();
        ctx.setLineDash([6, 5]);
        for (var i = 1; i <= p.contours; i += 1) {
            var level = 1.2 + (Math.max(1.4, p.separation / 18 - 1) - 1.2) * (i - 1) / (p.contours - 1);
            drawContour(level);
            drawContour(-level);
        }
        stroke(ctx, [[0, yMin], [0, yMax]]);
        ctx.restore();
        if (p.showLabels) {
            text(ctx, 'V > 0', left, yMin - 18, 13);
            text(ctx, 'V < 0', right, yMin - 18, 13);
            text(ctx, 'V = 0', 0, yMin - 2, 12);
        }
        circle(ctx, left, 0, 13, true); text(ctx, '+', left, 0, 15);
        circle(ctx, right, 0, 13, true); text(ctx, '−', right, 0, 15);
    }, { keywords: ['等位線', '等電位', '電位'], suppressCommonLabel: true, parametric: equipotentialParametric });

    add('electromagnetism', 'magneticIntoPage', '磁場入紙面 ×', 48, 48, function (ctx, item) {
        var p = params('magneticIntoPage', item);
        circle(ctx, 0, 0, p.radius, false);
        cross(ctx, 0, 0, p.radius * 0.55);
    }, { keywords: ['磁場入紙面', '叉號', '×'], suppressCommonLabel: true, parametric: radiusSmart('magneticIntoPage', 18, 10, 38, '符號大小') });

    add('electromagnetism', 'magneticOutPage', '磁場出紙面 •', 48, 48, function (ctx, item) {
        var p = params('magneticOutPage', item);
        circle(ctx, 0, 0, p.radius, false);
        dot(ctx, 0, 0, Math.max(3, p.radius * 0.2));
    }, { keywords: ['磁場出紙面', '圓點', '•'], suppressCommonLabel: true, parametric: radiusSmart('magneticOutPage', 18, 10, 38, '符號大小') });

    var uniformMagneticParametric = smart(
        { width: 210, height: 150, columns: 5, rows: 4, direction: 1 },
        [control('width', '磁場寬度', 90, 360, 1, 'px'), control('height', '磁場高度', 70, 280, 1, 'px'), control('columns', '橫向數量', 3, 9, 1, '個'), control('rows', '縱向數量', 2, 7, 1, '個'), choice('direction', '磁場方向', [{ value: 1, label: '出紙面 •' }, { value: -1, label: '入紙面 ×' }])],
        {
            bounds: function (item) { var p = params('uniformMagneticField', item); return { left: -p.width / 2 - 8, top: -p.height / 2 - 8, right: p.width / 2 + 8, bottom: p.height / 2 + 8 }; },
            handles: function (item) { var p = params('uniformMagneticField', item); return [{ id: 'size', label: '場區大小', x: p.width / 2, y: p.height / 2, primary: true, readout: p.width + ' × ' + p.height }]; },
            update: function (item, id, point) {
                if (id !== 'size') return null;
                var p = params('uniformMagneticField', item);
                p.width = clamp(Math.abs(point.x) * 2, 90, 360, p.width);
                p.height = clamp(Math.abs(point.y) * 2, 70, 280, p.height);
                item.params = library.sanitizeParams('uniformMagneticField', p);
                return { readout: Math.round(item.params.width) + ' × ' + Math.round(item.params.height) + ' px' };
            }
        }
    );
    add('electromagnetism', 'uniformMagneticField', '均勻磁場區', 230, 170, function (ctx, item) {
        var p = params('uniformMagneticField', item);
        ctx.save(); ctx.setLineDash([5, 5]); ctx.strokeRect(-p.width / 2, -p.height / 2, p.width, p.height); ctx.restore();
        for (var row = 0; row < p.rows; row += 1) {
            for (var col = 0; col < p.columns; col += 1) {
                var x = -p.width * 0.4 + p.width * 0.8 * col / Math.max(1, p.columns - 1);
                var y = -p.height * 0.38 + p.height * 0.76 * row / Math.max(1, p.rows - 1);
                var radius = Math.min(8, p.width * 0.8 / (p.columns - 1) * 0.35, p.height * 0.76 / (p.rows - 1) * 0.35);
                circle(ctx, x, y, radius, false);
                if (p.direction > 0) dot(ctx, x, y, radius * 0.32); else cross(ctx, x, y, radius * 0.56);
            }
        }
    }, { keywords: ['均勻磁場', '磁場區', '出紙面', '入紙面'], suppressCommonLabel: true, parametric: uniformMagneticParametric });

    var magnetParametric = smart(
        { length: 150, height: 52, lines: 4, northSide: -1, showArrows: 1 },
        [choice('northSide', 'N 極位置', [{ value: -1, label: '左側 N、右側 S' }, { value: 1, label: '左側 S、右側 N' }]), choice('showArrows', '磁力線方向箭頭', [{ value: 1, label: '顯示' }, { value: 0, label: '隱藏（供學生判斷）' }]), control('length', '磁鐵長度', 80, 260, 1, 'px'), control('height', '磁鐵高度', 34, 90, 1, 'px'), control('lines', '磁力線數量', 2, 7, 1, '條')],
        { bounds: function (item) { var p = params('barMagnetField', item); var extent = p.height / 2 + p.lines * 18; return { left: -p.length / 2 - p.lines * 14 - 12, right: p.length / 2 + p.lines * 14 + 12, top: -extent - 12, bottom: extent + 12 }; } }
    );
    add('electromagnetism', 'barMagnetField', '條形磁鐵與磁力線', 300, 220, function (ctx, item) {
        var p = params('barMagnetField', item);
        ctx.fillRect(-p.length / 2, -p.height / 2, p.length, p.height);
        ctx.strokeRect(-p.length / 2, -p.height / 2, p.length, p.height);
        stroke(ctx, [[0, -p.height / 2], [0, p.height / 2]]);
        text(ctx, p.northSide < 0 ? 'N' : 'S', -p.length / 4, 0, 20);
        text(ctx, p.northSide < 0 ? 'S' : 'N', p.length / 4, 0, 20);
        for (var i = 1; i <= p.lines; i += 1) {
            var spread = p.height / 2 + i * 18;
            var poleY = p.height * 0.44 * (p.lines + 1 - i) / p.lines;
            var outerX = p.length / 2 + i * 14;
            [-1, 1].forEach(function (sign) {
                begin(ctx); ctx.moveTo(-p.length / 2, sign * poleY);
                ctx.bezierCurveTo(-outerX, sign * poleY, -outerX, sign * spread, 0, sign * spread);
                ctx.bezierCurveTo(outerX, sign * spread, outerX, sign * poleY, p.length / 2, sign * poleY);
                ctx.stroke();
                if (p.showArrows) arrow(ctx, p.northSide * 8, sign * spread, 0, sign * spread, 6);
            });
        }
    }, { keywords: ['條形磁鐵', '磁力線', 'N極', 'S極'], suppressCommonLabel: true, parametric: magnetParametric });

    var wireFieldParametric = smart(
        { radius: 92, rings: 4, current: 1 },
        [control('radius', '磁場範圍', 48, 165, 1, 'px'), control('rings', '磁力線圈數', 2, 7, 1, '圈'), choice('current', '電流方向', [{ value: 1, label: '出紙面 •' }, { value: -1, label: '入紙面 ×' }])],
        { bounds: function (item) { var p = params('wireMagneticField', item); return { left: -p.radius - 12, top: -p.radius - 12, right: p.radius + 12, bottom: p.radius + 12 }; } }
    );
    add('electromagnetism', 'wireMagneticField', '長直導線磁場', 220, 220, function (ctx, item) {
        var p = params('wireMagneticField', item);
        for (var i = 1; i <= p.rings; i += 1) {
            // Logarithmic radial sampling: spacing increases outwards (B ∝ 1/r).
            var radius = 22 * Math.pow(p.radius / 22, (i - 1) / Math.max(1, p.rings - 1));
            circle(ctx, 0, 0, radius, false);
            var x = radius / Math.sqrt(2); var y = x;
            var tx = p.current / Math.sqrt(2); var ty = -tx;
            arrow(ctx, x - tx * 7, y - ty * 7, x, y, 5);
        }
        circle(ctx, 0, 0, 13, false);
        if (p.current > 0) dot(ctx, 0, 0, 4); else cross(ctx, 0, 0, 7);
        text(ctx, 'I', 19, -16, 14);
    }, { keywords: ['長直導線', '安培右手定則', '磁場'], suppressCommonLabel: true, parametric: wireFieldParametric });

    var loopFieldParametric = smart(
        { radius: 62, turns: 3, field: 75, currentDirection: 1 },
        [control('radius', '線圈半徑', 35, 110, 1, 'px'), control('turns', '線圈匝數', 1, 6, 1, '匝'), control('field', '磁場箭頭', 35, 130, 1, 'px'), choice('currentDirection', '電流方向', [{ value: 1, label: '近側向左（B 向上）' }, { value: -1, label: '近側向右（B 向下）' }])],
        { bounds: defaultBounds(270, 220, 8) }
    );
    add('electromagnetism', 'loopMagneticField', '圓線圈磁場', 270, 220, function (ctx, item) {
        var p = params('loopMagneticField', item);
        // A thin N-turn loop uses one outline, not several different radii.
        ctx.save(); ctx.setLineDash([5, 4]);
        begin(ctx); ctx.ellipse(0, 0, p.radius, p.radius * 0.38, 0, Math.PI, Math.PI * 2); ctx.stroke();
        ctx.restore();
        begin(ctx); ctx.ellipse(0, 0, p.radius, p.radius * 0.38, 0, 0, Math.PI); ctx.stroke();
        if (p.turns > 1) text(ctx, 'N = ' + p.turns, 0, Math.max(p.radius * 0.38, p.field / 2) + 20, 14);
        if (p.currentDirection > 0) arrow(ctx, 0, p.field / 2, 0, -p.field / 2, 8);
        else arrow(ctx, 0, -p.field / 2, 0, p.field / 2, 8);
        text(ctx, 'B', 15, (p.currentDirection > 0 ? -1 : 1) * p.field / 2 + 3, 15);
        if (p.currentDirection > 0) arrow(ctx, -p.radius * 0.65, p.radius * 0.3, -p.radius * 0.9, p.radius * 0.12, 6);
        else arrow(ctx, -p.radius * 0.9, p.radius * 0.12, -p.radius * 0.65, p.radius * 0.3, 6);
        text(ctx, 'I', -p.radius - 12, p.radius * 0.05, 14);
    }, { keywords: ['圓線圈', '磁場', '電流環'], suppressCommonLabel: true, parametric: loopFieldParametric });

    var solenoidParametric = smart(
        { length: 190, radius: 42, turns: 8, currentDirection: 1, solutionMode: 1, showReturn: 0 },
        [control('length', '繞線圖長', 100, 330, 1, 'px'), control('radius', '繞線圖半徑', 25, 75, 1, 'px'), control('turns', '顯示匝數（示意）', 4, 14, 1, '匝'),
            choice('currentDirection', '近側繞線電流', [{ value: 1, label: '向下' }, { value: -1, label: '向上' }, { value: 0, label: '未通電' }]),
            solutionControl(), choice('showReturn', '外部磁場回線', [{ value: 0, label: '隱藏' }, { value: 1, label: '顯示示意回線' }])],
        {
            getControls: function (item) {
                var p = params('solenoidField', item);
                return solenoidParametric.controls.filter(function (c) { return c.key !== 'showReturn' || (p.solutionMode && p.currentDirection !== 0); });
            },
            bounds: function (item) { var p = params('solenoidField', item); return { left: -p.length / 2 - 52, top: -p.radius - 56, right: p.length / 2 + 52, bottom: p.radius + 78 }; },
            handles: function (item) {
                var p = params('solenoidField', item);
                return [{ id: 'size', label: '繞線圖長與半徑', x: p.length / 2, y: -p.radius, primary: true, readout: p.length + ' × ' + (2 * p.radius) + ' px' }];
            },
            update: function (item, id, point) {
                if (id !== 'size') return null;
                var p = params('solenoidField', item);
                p.length = Math.abs(point.x) * 2; p.radius = Math.abs(point.y);
                item.params = library.sanitizeParams('solenoidField', p);
                return { readout: item.params.length + ' × ' + (2 * item.params.radius) + ' px' };
            }
        }
    );
    function solenoidPoint(p, phase) {
        return [-p.length / 2 + p.length * (phase + Math.PI / 2) / (2 * Math.PI * p.turns) + p.radius * 0.18 * Math.cos(phase), p.radius * Math.sin(phase)];
    }
    add('electromagnetism', 'solenoidField', '螺線管磁場', 260, 130, function (ctx, item) {
        var p = params('solenoidField', item);
        // One continuous helix. Rear half-turns are dashed; near half-turns solid.
        for (var half = 0; half < p.turns * 2; half += 1) {
            var segment = [];
            for (var j = 0; j <= 32; j += 1) segment.push(solenoidPoint(p, -Math.PI / 2 + half * Math.PI + Math.PI * j / 32));
            if (half % 2) dashed(ctx, segment); else stroke(ctx, segment);
        }
        stroke(ctx, [[-p.length / 2 - 26, -p.radius - 16], [-p.length / 2, -p.radius]]);
        stroke(ctx, [[p.length / 2, -p.radius], [p.length / 2 + 26, -p.radius - 16]]);
        if (p.currentDirection !== 0) {
            // At the near side (z towards viewer), downward current gives +x field.
            var phase = Math.floor(p.turns / 2) * 2 * Math.PI;
            var b = solenoidPoint(p, phase + p.currentDirection * 0.35);
            var currentPath = [];
            for (var k = 0; k <= 20; k += 1) currentPath.push(solenoidPoint(p, phase + p.currentDirection * (-0.35 + 0.7 * k / 20)));
            stroke(ctx, currentPath);
            var previous = currentPath[currentPath.length - 2];
            arrow(ctx, previous[0], previous[1], b[0], b[1], 6);
            text(ctx, p.currentDirection === 1 ? '近側 I 向下' : '近側 I 向上', 0, p.radius + 60, 13);
        } else text(ctx, 'I = 0', 0, p.radius + 60, 13);
        if (p.solutionMode && p.currentDirection !== 0) {
            var extent = p.length / 2 + 32; var sign = p.currentDirection;
            arrow(ctx, -sign * extent, 0, sign * extent, 0, 8);
            text(ctx, 'B', -p.length / 4, -15, 15);
            text(ctx, sign === 1 ? 'S' : 'N', -p.length / 2 - 15, -p.radius - 32, 15);
            text(ctx, sign === 1 ? 'N' : 'S', p.length / 2 + 15, -p.radius - 32, 15);
            if (p.showReturn) {
                for (var side of [-1, 1]) {
                    var y = side * (p.radius + 40);
                    begin(ctx); ctx.moveTo(extent, 0);
                    ctx.bezierCurveTo(extent + 12, y, -extent - 12, y, -extent, 0); ctx.stroke();
                    // Cubic midpoint y is 3/4 of its control height; arrow on the curve.
                    arrow(ctx, sign * 8, 0.75 * y, -sign * 8, 0.75 * y, 6);
                }
            }
        } else if (p.solutionMode) text(ctx, 'B = 0（忽略外場）', 0, -p.radius - 34, 12);
    }, { keywords: ['螺線管', '電磁鐵', '磁場'], modelNote: '連續螺旋導線的側向投影：近側實線、背側虛線；近側電流向下時，內部 B 向右，右端為 N。電流選單同步反轉磁極與內外箭頭；未通電以空心線圈、忽略外場及剩磁處理。外部回線只示意閉合方向，不是有限長螺線管的精確場線；圖長、半徑與顯示匝數只供排圖，不計算 μnI。題目模式隱藏 B、磁極與回線，保留電流條件；JSON 保留答案設定。', suppressCommonLabel: true, parametric: solenoidParametric });

    function electricParticleDeflection(p) {
        return p.deflection * p.chargeSign * p.platePolarity;
    }

    function electricParticleState(item) {
        var p = params('chargedParticleElectric', item);
        var deflection = electricParticleDeflection(p);
        var clearance = p.height / 2 - 6;
        var hit = Math.abs(deflection) >= clearance;
        var t = hit ? Math.sqrt(clearance / Math.max(1, Math.abs(deflection))) : 1;
        var left = -p.width / 2;
        var end = { x: left + p.width * t, y: deflection * t * t };
        var slope = 2 * deflection * t / p.width;
        var tail = hit ? end : { x: end.x + 42, y: end.y + 42 * slope };
        return { p: p, deflection: deflection, hit: hit, t: t, end: end, tail: tail };
    }

    var electricParticleParametric = smart(
        { width: 220, height: 130, deflection: 48, chargeSign: 1, platePolarity: 1 },
        [
            control('width', '場區寬度', 120, 360, 1, 'px'),
            control('height', '場區高度', 80, 230, 1, 'px'),
            control('deflection', '偏轉程度', 0, 120, 1, 'px'),
            choice('chargeSign', '粒子電性', [{ value: 1, label: '正電荷 q⁺' }, { value: -1, label: '負電荷 q⁻' }]),
            choice('platePolarity', '極板方向', [{ value: 1, label: '上正、下負' }, { value: -1, label: '上負、下正' }])
        ],
        {
            sanitize: function (source) {
                var incoming = source && typeof source === 'object' ? source : {};
                var legacyCurvature = number(incoming.curvature, 48);
                return {
                    width: Math.round(clamp(incoming.width, 120, 360, 220)),
                    height: Math.round(clamp(incoming.height, 80, 230, 130)),
                    deflection: Math.round(clamp(incoming.deflection, 0, 120, Math.abs(legacyCurvature))),
                    chargeSign: number(incoming.chargeSign, legacyCurvature < 0 ? -1 : 1) < 0 ? -1 : 1,
                    platePolarity: number(incoming.platePolarity, 1) < 0 ? -1 : 1
                };
            },
            bounds: function (item) { var s = electricParticleState(item); var p = s.p; return { left: -p.width / 2 - 55, top: Math.min(-p.height / 2 - 22, s.tail.y - 22), right: p.width / 2 + 82, bottom: Math.max(p.height / 2 + 22, s.tail.y + 22) }; },
            handles: function (item) { var s = electricParticleState(item); return [{ id: 'exit', label: s.hit ? '撞板位置' : '出射偏轉', x: s.end.x, y: s.end.y, primary: true, readout: s.hit ? '已撞板；拖曳撞擊點調整' : 'Δy ' + s.end.y.toFixed(1) + ' px' }]; },
            update: function (item, id, point) {
                if (id !== 'exit') return null;
                var p = params('chargedParticleElectric', item);
                var direction = p.chargeSign * p.platePolarity;
                var t = clamp((point.x + p.width / 2) / p.width, 0.08, 1, 1);
                p.deflection = clamp(point.y * direction / (t * t), 0, 120, p.deflection);
                item.params = library.sanitizeParams('chargedParticleElectric', p);
                return { readout: 'Δy ' + Math.round(electricParticleDeflection(item.params)) + ' px' };
            }
        }
    );
    add('electromagnetism', 'chargedParticleElectric', '帶電粒子通過電場', 320, 180, function (ctx, item) {
        var state = electricParticleState(item); var p = state.p;
        var left = -p.width / 2;
        var right = p.width / 2;
        stroke(ctx, [[left, -p.height / 2], [right, -p.height / 2]]);
        stroke(ctx, [[left, p.height / 2], [right, p.height / 2]]);
        text(ctx, p.platePolarity > 0 ? '+ + + +' : '− − − −', 0, -p.height / 2 - 12, 14);
        text(ctx, p.platePolarity > 0 ? '− − − −' : '+ + + +', 0, p.height / 2 + 13, 14);
        arrow(ctx, -p.width / 2 - 48, 0, -p.width / 2, 0, 8);
        text(ctx, 'v₀', -p.width / 2 - 22, -15, 14);
        begin(ctx); ctx.moveTo(left, 0); ctx.quadraticCurveTo((left + state.end.x) / 2, 0, state.end.x, state.end.y); ctx.stroke();
        if (!state.hit) arrow(ctx, state.end.x, state.end.y, state.tail.x, state.tail.y, 7);
        circle(ctx, state.tail.x, state.tail.y, 6, true); text(ctx, state.hit ? '撞板' : (p.chargeSign > 0 ? 'q⁺' : 'q⁻'), state.tail.x + 16, state.tail.y, 13);
    }, { keywords: ['帶電粒子', '電場偏轉', '平行板'], suppressCommonLabel: true, parametric: electricParticleParametric });

    function magneticParticleState(item) {
        var p = params('chargedParticleMagnetic', item);
        var direction = p.chargeSign * p.fieldDirection;
        var startX = p.entryMode === 1 ? 0 : -p.fieldSize / 2;
        var center = { x: startX, y: direction * p.radius };
        var startAngle = -direction * Math.PI / 2;
        var endAngle = startAngle + direction * p.sweep * DEG;
        return {
            p: p,
            direction: direction,
            startX: startX,
            center: center,
            startAngle: startAngle,
            endAngle: endAngle,
            end: { x: center.x + p.radius * Math.cos(endAngle), y: center.y + p.radius * Math.sin(endAngle) }
        };
    }

    var magneticParticleParametric = smart(
        { radius: 82, sweep: 150, fieldSize: 220, chargeSign: 1, fieldDirection: -1, entryMode: 0 },
        [
            control('radius', '軌跡半徑', 35, 150, 1, 'px'),
            control('sweep', '偏轉角度', 30, 300, 1, '°'),
            control('fieldSize', '磁場範圍', 140, 680, 1, 'px'),
            choice('entryMode', '軌跡情境', [{ value: 0, label: '從場外入射（出場後直行）' }, { value: 1, label: '場內粒子（完整圓軌跡）' }]),
            choice('chargeSign', '粒子電性', [{ value: 1, label: '正電荷 q⁺' }, { value: -1, label: '負電荷 q⁻' }]),
            choice('fieldDirection', '磁場方向', [{ value: -1, label: '入紙面 ×' }, { value: 1, label: '出紙面 •' }])
        ],
        {
            sanitize: function (source) {
                var p = source || {}; var radius = Math.round(clamp(p.radius, 35, 150, 82));
                var entryMode = Number(p.entryMode) === 1 ? 1 : 0;
                var fieldSize = Math.round(clamp(p.fieldSize, entryMode ? 4 * radius + 24 : 140, 680, 220));
                var limit = entryMode ? 300 : Math.min(180, Math.acos(Math.max(-1, 1 - fieldSize / (2 * radius))) / DEG);
                return { radius: radius, sweep: Math.min(limit, clamp(p.sweep, 30, 300, 150)), fieldSize: fieldSize, chargeSign: number(p.chargeSign, 1) < 0 ? -1 : 1, fieldDirection: number(p.fieldDirection, -1) < 0 ? -1 : 1, entryMode: entryMode };
            },
            bounds: function (item) { var s = magneticParticleState(item); var half = s.p.fieldSize / 2; return { left: -half - 62, right: half + 62, top: -half - 62, bottom: half + 62 }; },
            handles: function (item) { var s = magneticParticleState(item); return [{ id: 'exit', label: '軌跡', x: s.end.x, y: s.end.y, primary: true, readout: 'r ' + s.p.radius + ' · φ ' + s.p.sweep + '°' }]; },
            update: function (item, id, point) {
                if (id !== 'exit') return null;
                var p = params('chargedParticleMagnetic', item);
                var state = magneticParticleState(item);
                var dx = point.x - state.startX;
                var directedY = point.y * state.direction;
                if (directedY > 0.1) {
                    p.radius = clamp((dx * dx + directedY * directedY) / (2 * directedY), 35, 150, p.radius);
                    p.sweep = clamp(2 * Math.atan2(directedY, dx) / DEG, 30, 300, p.sweep);
                }
                item.params = library.sanitizeParams('chargedParticleMagnetic', p);
                return { readout: 'r ' + Math.round(item.params.radius) + ' px · φ ' + Math.round(item.params.sweep) + '°' };
            }
        }
    );
    add('electromagnetism', 'chargedParticleMagnetic', '帶電粒子通過磁場', 340, 300, function (ctx, item) {
        var s = magneticParticleState(item); var p = s.p;
        ctx.save(); ctx.setLineDash([5, 5]); ctx.strokeRect(-p.fieldSize / 2, -p.fieldSize / 2, p.fieldSize, p.fieldSize); ctx.restore();
        for (var y = -p.fieldSize * 0.35; y <= p.fieldSize * 0.35; y += 42) {
            for (var x = -p.fieldSize * 0.35; x <= p.fieldSize * 0.35; x += 42) { circle(ctx, x, y, 6, false); if (p.fieldDirection < 0) cross(ctx, x, y, 3.5); else dot(ctx, x, y, 2.5); }
        }
        begin(ctx);
        ctx.arc(s.center.x, s.center.y, p.radius, s.startAngle, s.endAngle, s.direction < 0);
        ctx.stroke();
        arrow(ctx, s.startX - (p.entryMode === 1 ? 30 : 45), 0, s.startX, 0, 8);
        text(ctx, 'v', s.startX - 22, -14, 14);
        if (!p.entryMode && (Math.abs(s.end.y) >= p.fieldSize / 2 - 0.01 || p.sweep >= 179.99)) {
            var tangent = { x: Math.cos(p.sweep * DEG), y: s.direction * Math.sin(p.sweep * DEG) };
            arrow(ctx, s.end.x, s.end.y, s.end.x + 42 * tangent.x, s.end.y + 42 * tangent.y, 7);
        }
        circle(ctx, s.startX, 0, 5, true);
        text(ctx, p.chargeSign > 0 ? 'q⁺' : 'q⁻', s.startX + 14, -14, 13, 'left');
    }, { keywords: ['帶電粒子', '磁場偏轉', '洛侖茲力', '圓周運動'], suppressCommonLabel: true, parametric: magneticParticleParametric });

    var conductorForceParametric = smart(
        { length: 180, fieldWidth: 250, force: 72, currentDirection: 1, fieldDirection: -1, showForce: 1 },
        [choice('currentDirection', '電流方向', [{ value: 1, label: '向右' }, { value: -1, label: '向左' }]), choice('fieldDirection', '磁場方向', [{ value: -1, label: '入紙面（叉）' }, { value: 1, label: '出紙面（點）' }]), choice('showForce', '受力箭頭', [{ value: 0, label: '隱藏（題目）' }, { value: 1, label: '顯示（解答）' }]), control('length', '導線長度', 90, 280, 1, 'px'), control('fieldWidth', '磁場寬度', 150, 360, 1, 'px'), control('force', '力箭頭長度（僅示意）', 35, 120, 1, 'px')],
        {
            getControls: function (item) { return conductorForceParametric.controls.filter(function (c) { return c.key !== 'force' || params('conductorForce', item).showForce; }); },
            handles: function (item) {
                var p = params('conductorForce', item);
                var handles = [{ id: 'wire-length', label: '導線', x: p.currentDirection * p.length / 2, y: 0, primary: true }, { id: 'field-width', label: '磁場', x: p.fieldWidth / 2, y: -82 }];
                if (p.showForce) handles.push({ id: 'force-length', label: '受力', x: 0, y: p.currentDirection * p.fieldDirection * p.force });
                return handles;
            },
            update: function (item, id, point) {
                var p = params('conductorForce', item);
                if (id === 'wire-length') p.length = clamp(p.currentDirection * point.x * 2, 90, 280, p.length);
                else if (id === 'field-width') p.fieldWidth = clamp(point.x * 2, 150, 360, p.fieldWidth);
                else if (id === 'force-length' && p.showForce) p.force = clamp(p.currentDirection * p.fieldDirection * point.y, 35, 120, p.force);
                else return null;
                item.params = library.sanitizeParams(item.type, p); return {};
            },
            bounds: function (item) { var p = params('conductorForce', item); var fy = p.showForce ? p.currentDirection * p.fieldDirection * p.force : 0; return { left: -Math.max(p.fieldWidth, p.length) / 2 - 10, right: Math.max(p.fieldWidth, p.length) / 2 + 10, top: Math.min(-92, fy - 15), bottom: Math.max(92, fy + 15) }; }
        }
    );
    add('electromagnetism', 'conductorForce', '載流導線受磁力', 390, 230, function (ctx, item) {
        var p = params('conductorForce', item);
        ctx.save(); ctx.setLineDash([5, 5]); ctx.strokeRect(-p.fieldWidth / 2, -82, p.fieldWidth, 164); ctx.restore();
        [-0.36, -0.18, 0.18, 0.36].forEach(function (fraction) {
            var x = fraction * p.fieldWidth;
            if (Math.abs(x) < 30) return; // Keep the force shaft and label clear.
            for (var y = -55; y <= 55; y += 110) { circle(ctx, x, y, 6, false); if (p.fieldDirection < 0) cross(ctx, x, y, 3.5); else dot(ctx, x, y, 1.8); }
        });
        ctx.lineWidth *= 2.2;
        arrow(ctx, -p.currentDirection * p.length / 2, 0, p.currentDirection * p.length / 2, 0, 9);
        ctx.lineWidth /= 2.2;
        text(ctx, 'I', -p.currentDirection * p.length / 4, 16, 15);
        if (p.showForce) {
            var forceY = p.currentDirection * p.fieldDirection * p.force;
            arrow(ctx, 0, 0, 0, forceY, 9);
            text(ctx, 'F', 15, forceY, 15);
        }
    }, { keywords: ['載流導線', '安培力', '磁力'], suppressCommonLabel: true, parametric: conductorForceParametric });

    var inductionParametric = smart(
        { distance: 90, turns: 5, motion: 55, motionDirection: null, motionLength: null, nearPole: 1, showResponse: 0 },
        [choice('nearPole', '靠近線圈的磁極', [{ value: 1, label: 'N 極朝向線圈' }, { value: -1, label: 'S 極朝向線圈' }]), choice('motionDirection', '磁鐵運動', [{ value: 1, label: '靠近線圈' }, { value: -1, label: '遠離線圈' }, { value: 0, label: '靜止' }]), choice('showResponse', '感應方向提示', [{ value: 0, label: '隱藏（題目）' }, { value: 1, label: '顯示線圈近端磁極（解答）' }]), control('distance', '磁鐵位置（距圖心）', 45, 180, 1, 'px'), control('turns', '線圈匝數', 3, 9, 1, '匝'), control('motionLength', '速度箭頭顯示長度', 1, 90, 1, 'px')],
        {
            sanitize: function (source) {
                var legacy = clamp(source.motion, -90, 90, 55);
                var direction = source.motionDirection == null ? Math.sign(legacy) : Math.round(clamp(source.motionDirection, -1, 1, 1));
                var length = Math.round(clamp(source.motionLength == null ? Math.abs(legacy) : source.motionLength, 1, 90, 55));
                return { distance: Math.round(clamp(source.distance, 45, 180, 90)), turns: Math.round(clamp(source.turns, 3, 9, 5)), motion: direction * length, motionDirection: direction, motionLength: length, nearPole: number(source.nearPole, 1) < 0 ? -1 : 1, showResponse: Math.round(clamp(source.showResponse, 0, 1, 0)) };
            },
            getControls: function (item) { var p = params('inductionCoil', item); return inductionParametric.controls.filter(function (c) { return c.key !== 'motionLength' || p.motionDirection !== 0; }); },
            bounds: function (item) { var p = params('inductionCoil', item); return { left: Math.min(-p.distance - 82, -p.distance - 10 + p.motion - 10), right: 226, top: -84, bottom: 94 }; },
            handles: function (item) { var p = params('inductionCoil', item); return [{ id: 'magnet', label: '磁鐵位置', x: -p.distance - 20, y: 0, primary: true, readout: '位置 ' + p.distance }, { id: 'motion', label: '速度箭頭', x: -p.distance - 10 + p.motion, y: -54, readout: p.motionDirection > 0 ? '靠近' : p.motionDirection < 0 ? '遠離' : '靜止' }]; },
            update: function (item, id, point) { var p = params('inductionCoil', item); if (id === 'magnet') p.distance = -point.x - 20; else if (id === 'motion') { var motion = point.x + p.distance + 10; p.motionDirection = Math.abs(motion) < 0.5 ? 0 : Math.sign(motion); if (p.motionDirection) p.motionLength = Math.abs(motion); } else return null; item.params = library.sanitizeParams('inductionCoil', p); return { readout: id === 'magnet' ? '位置 ' + item.params.distance : item.params.motionDirection > 0 ? '靠近' : item.params.motionDirection < 0 ? '遠離' : '靜止' }; }
        }
    );
    add('electromagnetism', 'inductionCoil', '磁鐵線圈電磁感應', 390, 180, function (ctx, item) {
        var p = params('inductionCoil', item);
        var magnetX = -p.distance;
        ctx.fillRect(magnetX - 70, -28, 100, 56); ctx.strokeRect(magnetX - 70, -28, 100, 56);
        stroke(ctx, [[magnetX - 20, -28], [magnetX - 20, 28]]);
        text(ctx, p.nearPole > 0 ? 'S' : 'N', magnetX - 45, 0, 18); text(ctx, p.nearPole > 0 ? 'N' : 'S', magnetX + 5, 0, 18);
        begin(ctx);
        for (var half = 0; half < p.turns * 2; half += 1) {
            var points = [];
            for (var i = 0; i <= 32; i += 1) {
                var phase = (half + i / 32) * Math.PI;
                points.push([60 + 70 * phase / (p.turns * 2 * Math.PI) + 10 * Math.sin(phase), -56 * Math.cos(phase)]);
            }
            if (half % 2) dashed(ctx, points); else stroke(ctx, points);
        }
        stroke(ctx, [[60, -56], [35, -56], [35, 78], [190, 78], [190, 24]]);
        stroke(ctx, [[130, -56], [190, -56], [190, -24]]);
        circle(ctx, 190, 0, 24, true); text(ctx, 'G', 190, 0, 18);
        if (p.motionDirection) { arrow(ctx, magnetX - 10, -54, magnetX - 10 + p.motion, -54, Math.min(8, Math.abs(p.motion) * 0.7)); text(ctx, 'v', magnetX - 10 + p.motion / 2, -68, 14); }
        else text(ctx, '靜止', magnetX - 20, -54, 13);
        if (p.showResponse) text(ctx, p.motionDirection ? '近端 ' + (p.nearPole * p.motionDirection > 0 ? 'N' : 'S') : '無感應電流', 90, -73, 12);
    }, { keywords: ['電磁感應', '楞次定律', '磁鐵線圈', '法拉第'], modelNote: '磁鐵沿線圈軸線移動；近端指線圈朝向磁鐵的一端。解答依楞次定律標出近端磁極，不推定檢流計接線正負。靜止時假設無其他磁通量變化；箭頭長度僅為顯示尺寸，非速度數值。', suppressCommonLabel: true, parametric: inductionParametric });

    var transformerParametric = smart(
        { primary: 5, secondary: 9, spacing: 78 },
        [control('primary', '一次側匝數', 2, 12, 1, '匝'), control('secondary', '二次側匝數', 2, 12, 1, '匝'), control('spacing', '線圈間距', 55, 120, 1, 'px')],
        {
            bounds: defaultBounds(290, 190, 8),
            handles: function (item) { var p = params('transformer', item); return [{ id: 'primary', label: '一次線圈', x: -p.spacing / 2, y: 0, primary: true, readout: 'd ' + p.spacing }, { id: 'secondary', label: '二次線圈', x: p.spacing / 2, y: 0, readout: 'd ' + p.spacing }]; },
            update: function (item, id, point) { if (id !== 'primary' && id !== 'secondary') return null; var p = params('transformer', item); p.spacing = Math.abs(point.x) * 2; item.params = library.sanitizeParams('transformer', p); return { readout: 'd ' + item.params.spacing + ' px' }; }
        }
    );
    add('electromagnetism', 'transformer', '變壓器', 290, 190, function (ctx, item) {
        var p = params('transformer', item);
        var left = -p.spacing / 2;
        var right = p.spacing / 2;
        [[left, p.primary, 1], [right, p.secondary, -1]].forEach(function (side) {
            ctx.save(); ctx.translate(side[0], 0); ctx.rotate(Math.PI / 2);
            var width = 132 / (side[1] - (side[1] - 1) * 0.22);
            var depthScale = Math.min(1, (p.spacing / 2 - 12) / (width * 0.65));
            ctx.scale(1, side[2] * depthScale);
            library.drawInductorWinding(ctx, 132, side[1], 0, 0);
            ctx.restore();
        });
        ctx.lineWidth *= 2;
        stroke(ctx, [[-7, -72], [-7, 72]]); stroke(ctx, [[7, -72], [7, 72]]);
        ctx.lineWidth /= 2;
        stroke(ctx, [[left, -66], [-112, -66]]); stroke(ctx, [[left, 66], [-112, 66]]);
        stroke(ctx, [[right, -66], [112, -66]]); stroke(ctx, [[right, 66], [112, 66]]);
        text(ctx, 'N₁', left - 30, 0, 15); text(ctx, 'N₂', right + 30, 0, 15);
    }, { keywords: ['變壓器', '一次側', '二次側', '互感'], suppressCommonLabel: true, parametric: transformerParametric });

    function generatorState(item) {
        var p = params('generator', item); var theta = p.angle * DEG;
        var unit = { x: Math.sin(theta), y: 0.34 * Math.cos(theta) };
        return { p: p, unit: unit, normal: { x: 66 * Math.cos(theta), y: -24 * Math.sin(theta) },
            flux: p.fieldDirection * Math.cos(theta), emf: p.fieldDirection * p.rotationDirection * Math.sin(theta) };
    }
    var generatorParametric = smart(
        { coilWidth: 105, coilHeight: 70, angle: 25, fieldDirection: 1, rotationDirection: 1, solutionMode: 1, showCircuit: 1 },
        [control('coilWidth', '線圈圖寬', 65, 175, 1, 'px'), control('coilHeight', '線圈圖高', 45, 120, 1, 'px'), control('angle', '法向角 θ（自右方起算）', -180, 180, 1, '°'),
            choice('fieldDirection', '外加磁場 B', [{ value: 1, label: '向右（左 N、右 S）' }, { value: -1, label: '向左（左 S、右 N）' }]),
            choice('rotationDirection', '旋轉方向（由上往下看）', [{ value: 1, label: '順時針（θ 增加）' }, { value: -1, label: '逆時針（θ 減少）' }, { value: 0, label: '停止' }]),
            solutionControl(), choice('showCircuit', '滑環與負載接線', [{ value: 1, label: '顯示獨立展開圖' }, { value: 0, label: '只留線圈方位圖' }])],
        {
            bounds: function (item) { var p = params('generator', item); return { left: -182, right: 182, top: -172, bottom: p.showCircuit ? 328 : 162 }; },
            handles: function (item) {
                var s = generatorState(item); var p = s.p;
                return [
                    { id: 'normal', label: '線圈法向角', x: s.normal.x, y: s.normal.y, primary: true, readout: 'θ ' + p.angle + '°' },
                    { id: 'width', label: '線圈圖寬', x: p.coilWidth / 2 * s.unit.x, y: p.coilWidth / 2 * s.unit.y, readout: p.coilWidth + ' px' },
                    { id: 'height', label: '線圈圖高', x: 0, y: -p.coilHeight / 2, readout: p.coilHeight + ' px' }
                ];
            },
            update: function (item, id, point) {
                var s = generatorState(item); var p = s.p;
                if (id === 'normal') {
                    if (Math.hypot(point.x, point.y) < 1e-6) return null;
                    var angle = Math.atan2(-point.y / 24, point.x / 66) / DEG;
                    if (Math.abs(angle - p.angle) < 359.999999) p.angle = Math.abs(angle) < 1e-9 ? 0 : angle;
                }
                else if (id === 'width') p.coilWidth = 2 * Math.abs((point.x * s.unit.x + point.y * s.unit.y) / (s.unit.x * s.unit.x + s.unit.y * s.unit.y));
                else if (id === 'height') p.coilHeight = Math.abs(point.y) * 2;
                else return null;
                item.params = library.sanitizeParams('generator', p);
                return { readout: id === 'normal' ? 'θ ' + Math.round(item.params.angle) + '°' : item.params.coilWidth + ' × ' + item.params.coilHeight + ' px' };
            }
        }
    );
    add('electromagnetism', 'generator', '交流發電機', 330, 230, function (ctx, item) {
        var s = generatorState(item); var p = s.p;
        text(ctx, p.fieldDirection === 1 ? 'N' : 'S', -135, 0, 22); text(ctx, p.fieldDirection === 1 ? 'S' : 'N', 135, 0, 22);
        arrow(ctx, -p.fieldDirection * 105, -112, p.fieldDirection * 105, -112, 8); text(ctx, 'B', -118 * p.fieldDirection, -112, 15);
        var projected = p.coilWidth / 2 * s.unit.x;
        var depth = p.coilWidth / 2 * s.unit.y;
        // Upper view shows orientation/area only; the separate lower view is the circuit.
        stroke(ctx, [
            [-projected, -p.coilHeight / 2 - depth],
            [projected, -p.coilHeight / 2 + depth],
            [projected, p.coilHeight / 2 + depth],
            [-projected, p.coilHeight / 2 - depth]
        ], true);
        if (Math.abs(projected) < 1e-8) text(ctx, '線圈側視投影', 84, -66, 12);
        dashed(ctx, [[0, -96], [0, 92]]);
        if (p.rotationDirection) {
            var points = [];
            for (var k = 0; k <= 40; k += 1) {
                var a = p.rotationDirection * (0.2 + 1.5 * Math.PI * k / 40);
                points.push([24 * Math.cos(a), -147 + 11 * Math.sin(a)]);
            }
            stroke(ctx, points);
            var prev = points[points.length - 2]; var end = points[points.length - 1];
            arrow(ctx, prev[0], prev[1], end[0], end[1], 6);
            text(ctx, 'ω', 43, -147, 14);
        } else text(ctx, 'ω = 0', 0, -147, 14);
        arrow(ctx, 0, 0, s.normal.x, s.normal.y, 7);
        var theta = p.angle * DEG;
        text(ctx, 'n', 82 * Math.cos(theta), -34 * Math.sin(theta), 14);
        text(ctx, '線圈方位：θ = ' + p.angle + '°', 0, 108, 13);
        if (p.showCircuit) {
            text(ctx, '同一線圈的滑環接線（展開示意）', 0, 141, 12);
            // Open coil with two separate ends, each connected to its own full slip ring.
            stroke(ctx, [[-12, 186], [-44, 186], [-44, 160], [44, 160], [44, 186], [12, 186]]);
            stroke(ctx, [[-12, 186], [-24, 207]]); stroke(ctx, [[12, 186], [24, 207]]);
            circle(ctx, -24, 217, 10, false); circle(ctx, 24, 217, 10, false);
            ctx.strokeRect(-32, 227, 16, 8); ctx.strokeRect(16, 227, 16, 8);
            stroke(ctx, [[-24, 235], [-86, 235], [-86, 272], [-34, 272]]);
            stroke(ctx, [[24, 235], [86, 235], [86, 272], [34, 272]]);
            drawTaiwanResistor(ctx, -34, 34, 272, 'R');
            text(ctx, '滑環', 68, 213, 12); text(ctx, '電刷', -68, 213, 12);
            stroke(ctx, [[-58, 218], [-35, 230]]);
        }
        if (p.solutionMode) {
            var y = p.showCircuit ? 293 : 126;
            // Coefficients, not volts: B, A and |omega| have not been entered.
            text(ctx, 'Φ/(BA) = ' + (Math.abs(s.flux) < 1e-10 ? 0 : s.flux).toFixed(3), 0, y, 12);
            text(ctx, p.rotationDirection ? 'ε/(BA|ω|) = ' + (Math.abs(s.emf) < 1e-10 ? 0 : s.emf).toFixed(3) : 'ε = 0（停止）', 0, y + 19, 12);
        }
    }, { keywords: ['發電機', '交流發電', '磁通量', '滑環'], modelNote: '單匝線圈在均勻磁場中的原理題圖。上圖只表達線圈方位，虛線是轉軸；下圖為同一線圈、兩個完整滑環、電刷與電阻負載的展開接線，不是共軸機構的立體投影，也不是分裂式換向器。θ 從右方轉向近側的法向 n 為正，由上往下看為順時針；B 可反向。以右方 B 為基準，Φ=BA cosθ、ε=BAω sinθ；ω=dθ/dt。反向 B 或反轉旋轉方向會改變對應符號。解答只顯示相對 BA 與 BA|ω| 的係數，不是 Wb 或 V；停止時 ε=0，磁通量不一定為零。下圖不標端子正負，係數符號由 n 所選迴路正向定義；未計算負載電流、電刷損失或磁場反作用。題目模式隱藏係數，JSON 保留設定。', suppressCommonLabel: true, parametric: generatorParametric });

    var emWaveParametric = smart(
        { length: 260, amplitudeE: 55, amplitudeB: 38, wavelength: 92, phase: 0, direction: 1, fieldMode: 0, showPropagation: 1, showVectors: 1 },
        [control('length', '波列長度', 140, 430, 1, 'px'), control('amplitudeE', '電場顯示振幅（非 V/m）', 25, 90, 1, 'px'), control('amplitudeB', '磁場顯示振幅（非 T）', 18, 75, 1, 'px'), control('wavelength', '波長（圖上）', 45, 170, 1, 'px'), control('phase', '左端相位', -180, 180, 1, '°'), choice('direction', '傳播方向', [{ value: 1, label: '向右（+x）' }, { value: -1, label: '向左（−x）' }]), choice('fieldMode', '場的顯示', [{ value: 0, label: 'E 與 B' }, { value: 1, label: '只給 E（補畫 B）' }, { value: 2, label: '只給 B（補畫 E）' }]), choice('showPropagation', '傳播方向箭頭', [{ value: 0, label: '隱藏（判斷方向）' }, { value: 1, label: '顯示' }]), choice('showVectors', '場向量取樣箭頭', [{ value: 0, label: '隱藏' }, { value: 1, label: '顯示' }])],
        {
            getControls: function (item) { var p = params('electromagneticWave', item); return emWaveParametric.controls.filter(function (c) { return !(c.key === 'amplitudeE' && p.fieldMode === 2 || c.key === 'amplitudeB' && p.fieldMode === 1); }); },
            bounds: function (item) { var p = params('electromagneticWave', item); return { left: -p.length / 2 - 82, right: p.length / 2 + 52, top: -118, bottom: 150 }; },
            handles: function (item) { var p = params('electromagneticWave', item); return [{ id: 'length', label: '波列右端', x: p.length / 2, y: 0, primary: true, readout: 'L ' + p.length + ' px' }]; },
            update: function (item, id, point) { if (id !== 'length') return null; var p = params('electromagneticWave', item); p.length = Math.max(140, point.x * 2); item.params = library.sanitizeParams('electromagneticWave', p); return { readout: 'L ' + item.params.length + ' px' }; }
        }
    );
    add('electromagnetism', 'electromagneticWave', '電磁波 E–B–k', 460, 230, function (ctx, item) {
        var p = params('electromagneticWave', item);
        var left = -p.length / 2;
        var right = p.length / 2;
        stroke(ctx, [[left, 0], [right, 0]]);
        arrow(ctx, left, 0, left, -105, 7); text(ctx, '+y', left - 15, -102, 12);
        arrow(ctx, left, 0, left - 59, 41, 7); text(ctx, '+z', left - 67, 53, 12);
        text(ctx, 'x', right + 15, 0, 13);
        function wave(isB) {
            var count = Math.ceil(p.length / 2), points = [];
            for (var i = 0; i <= count; i++) {
                var x = left + p.length * i / count, value = Math.sin((x - left) / p.wavelength * Math.PI * 2 + p.phase * DEG);
                var z = p.direction * value * p.amplitudeB;
                points.push(isB ? [x - z * .65, z * .45] : [x, -value * p.amplitudeE]);
            }
            ctx.save(); if (isB) ctx.setLineDash([5, 4]); stroke(ctx, points); ctx.restore();
            if (p.showVectors) for (var j = 1; j <= 12; j++) {
                var base = left + p.length * j / 13, a = Math.sin((base - left) / p.wavelength * Math.PI * 2 + p.phase * DEG);
                var dx = isB ? -.65 * p.direction * p.amplitudeB * a : 0;
                var dy = isB ? .45 * p.direction * p.amplitudeB * a : -p.amplitudeE * a;
                if (Math.hypot(dx, dy) > 4) arrow(ctx, base, 0, base + dx, dy, Math.min(5, Math.hypot(dx, dy) / 2));
            }
        }
        if (p.fieldMode !== 2) wave(false);
        if (p.fieldMode !== 1) wave(true);
        if (p.showPropagation) { arrow(ctx, -p.direction * 28, -107, p.direction * 28, -107, 6); text(ctx, 'k', 0, -91, 13); }
        text(ctx, p.fieldMode === 0 ? '實線 E；虛線 B' : p.fieldMode === 1 ? '已知 E：補畫 B' : '已知 B：補畫 E', 0, 112, 12);
        text(ctx, '互相垂直的場之投影；E、B 使用不同顯示尺度', 0, 134, 11);
    }, { keywords: ['電磁波', '電場', '磁場', '傳播方向', '偏振'], modelNote: '真空中線偏振平面電磁波的同時快照，x 是傳播軸，+y 向上，+z 為朝觀察者的斜投影。E 沿 y，B 沿 z，且 E×B 沿 k；反轉傳播方向時保留 E 的瞬時形狀、反轉 B 分量。兩場同頻同相（對各自向量方向而言），真實大小滿足 E=cB；兩個 px 振幅只是獨立顯示尺度，不能相除當實際 E/B。虛線用來區分 B，並非另一時刻或虛構的場。只給一場時必須另給傳播方向，才可唯一決定另一場。無色也可辨識，不計算強度、介質、橢圓偏振或時間演化。', suppressCommonLabel: true, parametric: emWaveParametric });

    /* Circuit supplements used in laboratory and transient-response questions. */
    var potentiometerParametric = smart(
        { span: 150, wiper: 0, geometryVersion: null },
        [control('span', '元件寬度', 95, 250, 1, 'px'), control('wiper', '滑片位置', -1, 1, 0.05, '')],
        {
            sanitize: function (source) { var p = source || {}; return { span: Math.round(clamp(p.span, 95, 250, 150)), wiper: Math.round(clamp(p.wiper, -1, 1, 0) * (p.geometryVersion === 1 ? 1 : .56) * 1000) / 1000, geometryVersion: 1 }; },
            bounds: function (item) { var p = params('potentiometer3Terminal', item); return { left: -p.span / 2 - 42, right: p.span / 2 + 42, top: -81, bottom: 30 }; },
            handles: function (item) { var p = params('potentiometer3Terminal', item); return [{ id: 'wiper', label: '滑片接觸點', x: p.wiper * p.span / 2, y: potentiometerContactY(p), primary: true, readout: '位置 ' + p.wiper.toFixed(2) }, { id: 'terminal-left', label: '左端', x: -p.span / 2 - 35, y: 0 }, { id: 'terminal-right', label: '右端', x: p.span / 2 + 35, y: 0 }, { id: 'terminal-wiper', label: '滑片端', x: p.wiper * p.span / 2, y: -70 }]; },
            update: function (item, id, point) {
                var p = params('potentiometer3Terminal', item);
                if (id === 'wiper' || id === 'terminal-wiper') p.wiper = clamp(point.x / (p.span / 2), -1, 1, p.wiper);
                else if (id === 'terminal-left' || id === 'terminal-right') p.span = 2 * Math.max(47.5, Math.abs(point.x) - 35);
                else return null;
                item.params = library.sanitizeParams('potentiometer3Terminal', p);
                return { readout: '位置 ' + item.params.wiper.toFixed(2) };
            }
        }
    );
    function potentiometerContactY(p) {
        var t = (p.wiper + 1) * 5, index = Math.min(9, Math.floor(t)), fraction = t - index;
        function y(i) { return i === 0 || i === 10 ? 0 : i % 2 ? -11 : 11; }
        return y(index) + (y(index + 1) - y(index)) * fraction;
    }
    add('circuit', 'potentiometer3Terminal', '三端滑動變阻器', 280, 120, function (ctx, item) {
        var p = params('potentiometer3Terminal', item);
        var left = -p.span / 2;
        var right = p.span / 2;
        var points = [[left, 0]];
        for (var i = 1; i < 10; i += 1) points.push([left + p.span * i / 10, i % 2 ? -11 : 11]);
        points.push([right, 0]);
        stroke(ctx, [[left - 35, 0], [left, 0]]); stroke(ctx, points); stroke(ctx, [[right, 0], [right + 35, 0]]);
        var contactX = p.wiper * p.span / 2;
        arrow(ctx, contactX, -55, contactX, potentiometerContactY(p), 8);
        stroke(ctx, [[contactX, -55], [contactX, -70]]);
        circle(ctx, left - 35, 0, 3, true); circle(ctx, right + 35, 0, 3, true); circle(ctx, contactX, -70, 3, true);
    }, { keywords: ['三端滑動變阻器', '電位器', '滑片'], modelNote: '三端電阻符號，滑片接觸點可到兩端；位置 −1／+1 對應左／右端，與其中一端之理想電阻可為零。箭端貼在鋸齒電阻上，鋸齒只是符號。舊工程保留原來的滑片位置；不計算電阻值或電流。', suppressCommonLabel: true, parametric: potentiometerParametric });

    function circuitBoxParametric(type) {
        var minimumWidth = type === 'rlcCircuit' ? 320 : (type === 'meterExperimentCircuit' ? 300 : 240);
        return smart(
            { width: Math.max(250, minimumWidth), height: 130 },
            [control('width', '電路寬度', minimumWidth, 390, 1, 'px'), control('height', '電路高度', 110, 240, 1, 'px')],
            { bounds: function (item) { var p = params(type, item); return { left: -p.width / 2 - 20, top: -p.height / 2 - 28, right: p.width / 2 + 20, bottom: p.height / 2 + 28 }; } }
        );
    }

    function drawTaiwanResistor(ctx, left, right, y, label) {
        var bodyLeft = left;
        var bodyRight = right;
        var points = [[bodyLeft, y]];
        var teeth = 8;
        for (var i = 1; i < teeth; i += 1) {
            points.push([bodyLeft + (bodyRight - bodyLeft) * i / teeth, y + (i % 2 ? -10 : 10)]);
        }
        points.push([bodyRight, y]);
        stroke(ctx, points);
        if (label) text(ctx, label, (left + right) / 2, y - 24, 13);
    }

    function circuitDiagramParametric(type, parallel) {
        var defaults = { width: parallel ? 390 : 420, height: parallel ? 260 : 220, resistors: parallel ? 2 : 2, switchAngle: 28 };
        var controls = [
            control('width', '電路寬度', 300, 680, 1, 'px'),
            control('height', '電路高度', 170, 390, 1, 'px'),
            control('resistors', parallel ? '並聯支路數' : '串聯電阻數', 1, 4, 1, parallel ? '路' : '個'),
            control('switchAngle', '開關角度（0°閉合）', 0, 65, 1, '°')
        ];
        return smart(defaults, controls, {
            sanitize: function (source) {
                var incoming = source && typeof source === 'object' ? source : {};
                var resistors = Math.round(clamp(incoming.resistors, 1, 4, defaults.resistors));
                return {
                    width: Math.round(clamp(incoming.width, Math.max(300, 130 + resistors * 68), 680, defaults.width)),
                    height: Math.round(clamp(incoming.height, parallel ? 190 + resistors * 25 : 170, 390, defaults.height)),
                    resistors: resistors,
                    switchAngle: Math.round(clamp(incoming.switchAngle, 0, 65, defaults.switchAngle))
                };
            },
            bounds: function (item) {
                var p = params(type, item);
                return { left: -p.width / 2 - 28, top: -p.height / 2 - 35, right: p.width / 2 + 28, bottom: p.height / 2 + 30 };
            },
            handles: function (item) {
                var p = params(type, item); var bottom = p.height / 2;
                var pivotX = parallel ? p.width * 0.18 : -36;
                var bladeLength = parallel ? Math.min(72, p.width * 0.18) : 72;
                var angle = p.switchAngle * DEG;
                return [
                    { id: 'extent', label: '電路外框', x: p.width / 2, y: bottom, primary: true, readout: p.width + ' × ' + p.height + ' px' },
                    { id: 'switch', label: '開關', x: pivotX + bladeLength * Math.cos(angle), y: bottom - bladeLength * Math.sin(angle), readout: 'S ' + p.switchAngle + '°' }
                ];
            },
            update: function (item, id, point) {
                var p = params(type, item);
                if (id === 'extent') {
                    p.width = Math.abs(point.x) * 2;
                    p.height = Math.abs(point.y) * 2;
                } else if (id === 'switch') {
                    var pivotX = parallel ? p.width * 0.18 : -36;
                    p.switchAngle = clamp(-Math.atan2(point.y - p.height / 2, Math.max(1, point.x - pivotX)) / DEG, 0, 65, p.switchAngle);
                } else return null;
                item.params = library.sanitizeParams(type, p);
                return { readout: id === 'switch' ? 'S ' + Math.round(item.params.switchAngle) + '°' : item.params.width + ' × ' + item.params.height + ' px' };
            }
        });
    }

    function drawVerticalBattery(ctx, x, top, bottom) {
        var center = (top + bottom) / 2;
        stroke(ctx, [[x, top], [x, center - 13]]);
        stroke(ctx, [[x - 22, center - 13], [x + 22, center - 13]]);
        stroke(ctx, [[x - 13, center + 13], [x + 13, center + 13]]);
        stroke(ctx, [[x, center + 13], [x, bottom]]);
        text(ctx, 'ε', x + 30, center, 14);
    }

    var seriesCircuitParametric = circuitDiagramParametric('seriesCircuitDiagram', false);
    add('circuit', 'seriesCircuitDiagram', '串聯電路（智慧）', 480, 280, function (ctx, item) {
        var p = params('seriesCircuitDiagram', item); var left = -p.width / 2; var right = p.width / 2; var top = -p.height / 2; var bottom = p.height / 2;
        drawVerticalBattery(ctx, left, top, bottom);
        var availableLeft = left + 48; var availableRight = right - 36; var slot = (availableRight - availableLeft) / p.resistors; var cursor = left;
        for (var i = 0; i < p.resistors; i += 1) {
            var centerX = availableLeft + slot * (i + 0.5); var halfBody = Math.min(34, slot * 0.3);
            stroke(ctx, [[cursor, top], [centerX - halfBody, top]]);
            drawTaiwanResistor(ctx, centerX - halfBody, centerX + halfBody, top, p.resistors === 1 ? 'R' : 'R' + (i + 1));
            cursor = centerX + halfBody;
        }
        stroke(ctx, [[cursor, top], [right, top], [right, bottom], [36, bottom]]);
        stroke(ctx, [[left, bottom], [-36, bottom]]);
        circle(ctx, -36, bottom, 3, true); circle(ctx, 36, bottom, 3, true);
        var angle = p.switchAngle * DEG; var bladeLength = 72;
        stroke(ctx, [[-33, bottom], [-36 + bladeLength * Math.cos(angle), bottom - bladeLength * Math.sin(angle)]]);
        text(ctx, p.switchAngle < 3 ? 'S（閉）' : 'S（開）', 0, bottom + 20, 13);
    }, { keywords: ['串聯電路', '串聯電阻', '智慧電路', '台灣高中'], suppressCommonLabel: true, parametric: seriesCircuitParametric });

    var parallelCircuitParametric = circuitDiagramParametric('parallelCircuitDiagram', true);
    add('circuit', 'parallelCircuitDiagram', '並聯電路（智慧）', 480, 330, function (ctx, item) {
        var p = params('parallelCircuitDiagram', item); var left = -p.width / 2; var right = p.width / 2; var top = -p.height / 2; var bottom = p.height / 2;
        var firstY = top + 28; var lastY = bottom - 72;
        stroke(ctx, [[left, firstY], [left, bottom]]); stroke(ctx, [[right, firstY], [right, bottom]]);
        for (var i = 0; i < p.resistors; i += 1) {
            var ratio = p.resistors === 1 ? 0.5 : i / (p.resistors - 1);
            var y = firstY + (lastY - firstY) * ratio;
            stroke(ctx, [[left, y], [-38, y]]); drawTaiwanResistor(ctx, -38, 38, y, p.resistors === 1 ? 'R' : 'R' + (i + 1)); stroke(ctx, [[38, y], [right, y]]);
            dot(ctx, left, y, 2.5); dot(ctx, right, y, 2.5);
        }
        var batteryLeft = left + p.width * 0.25;
        stroke(ctx, [[left, bottom], [batteryLeft - 12, bottom]]);
        stroke(ctx, [[batteryLeft - 12, bottom - 22], [batteryLeft - 12, bottom + 22]]);
        stroke(ctx, [[batteryLeft + 12, bottom - 13], [batteryLeft + 12, bottom + 13]]);
        text(ctx, 'ε', batteryLeft, bottom + 28, 14);
        var pivotX = p.width * 0.18; var contactX = pivotX + Math.min(72, p.width * 0.18); var angle = p.switchAngle * DEG; var bladeLength = contactX - pivotX;
        stroke(ctx, [[batteryLeft + 12, bottom], [pivotX, bottom]]); circle(ctx, pivotX, bottom, 3, true); circle(ctx, contactX, bottom, 3, true);
        stroke(ctx, [[pivotX + 3, bottom], [pivotX + bladeLength * Math.cos(angle), bottom - bladeLength * Math.sin(angle)]]);
        stroke(ctx, [[contactX, bottom], [right, bottom]]);
        text(ctx, p.switchAngle < 3 ? 'S（閉）' : 'S（開）', (pivotX + contactX) / 2, bottom + 22, 13);
    }, { keywords: ['並聯電路', '並聯電阻', '智慧電路', '台灣高中'], suppressCommonLabel: true, parametric: parallelCircuitParametric });

    function circuitScenarioParametric(type) {
        var isRC = type === 'rcCircuit';
        var defaults = { width: isRC ? 250 : 340, height: 160, circuitMode: 0, switchClosed: isRC ? 0 : 1, showValues: 0, resistance: isRC ? 10 : 100, capacitance: 10, inductance: 100, voltage: 6, frequency: 50, idealLC: 0 };
        var controls = [
            choice('circuitMode', '電路情境', isRC ? [{ value: 0, label: '電池充電電路' }, { value: 1, label: '電容放電等效電路（移除電池）' }] : [{ value: 0, label: '交流電源驅動' }, { value: 1, label: '無外電源（初始電容已充電）' }]),
            choice('switchClosed', '開關 S', [{ value: 0, label: '開路' }, { value: 1, label: '閉合' }]),
            choice('showValues', '元件標示', [{ value: 0, label: '僅顯示物理符號' }, { value: 1, label: '顯示數值與單位' }])
        ];
        if (!isRC) controls.push(choice('idealLC', '串聯元件', [{ value: 0, label: 'R、L、C' }, { value: 1, label: '理想 L、C（忽略電阻）' }]));
        controls.push(control('resistance', '電阻 R', 1, 1000, 1, isRC ? 'kΩ' : 'Ω'), control('capacitance', '電容 C', 1, 1000, 1, 'μF'));
        if (!isRC) controls.push(control('inductance', '電感 L', 1, 1000, 1, 'mH'), control('frequency', '電源頻率 f', 1, 1000, 1, 'Hz'));
        controls.push(control('voltage', isRC ? '電池電壓' : '交流電壓有效值', 1, 240, 1, 'V'), control('width', '電路寬度', isRC ? 240 : 320, 480, 1, 'px'), control('height', '電路高度', 130, 260, 1, 'px'));
        var config = smart(defaults, controls, {
            bounds: function (item) { var p = params(type, item); return { left: -p.width / 2 - 28, top: -p.height / 2 - 46, right: p.width / 2 + 28, bottom: p.height / 2 + 35 }; },
            getControls: function (item) {
                var p = params(type, item);
                return controls.filter(function (c) {
                    if (['resistance', 'capacitance', 'inductance', 'voltage', 'frequency'].indexOf(c.key) < 0) return true;
                    if (!p.showValues) return false;
                    if (c.key === 'resistance' && p.idealLC && !isRC) return false;
                    return (c.key !== 'voltage' && c.key !== 'frequency') || p.circuitMode === 0;
                });
            },
            handles: function (item) { var p = params(type, item); return [{ id: 'switch', label: '開關', x: p.switchClosed ? 44 : 30, y: p.height / 2 - (p.switchClosed ? 0 : 30), primary: true, readout: p.switchClosed ? '閉合' : '開路' }]; },
            update: function (item, id, point) { if (id !== 'switch') return null; var p = params(type, item); p.switchClosed = point.y >= p.height / 2 - 12 ? 1 : 0; item.params = library.sanitizeParams(type, p); return { readout: item.params.switchClosed ? '閉合' : '開路' }; }
        });
        return config;
    }
    function drawScenarioSwitch(ctx, p) {
        var b = p.height / 2;
        stroke(ctx, [[-p.width / 2, b], [-44, b]]); stroke(ctx, [[44, b], [p.width / 2, b]]);
        stroke(ctx, [[-44, b], [p.switchClosed ? 44 : 30, b - (p.switchClosed ? 0 : 30)]]);
        circle(ctx, -44, b, 3, true); circle(ctx, 44, b, 3, true);
        text(ctx, p.switchClosed ? 'S（閉）' : 'S（開）', 0, b + 22, 13);
    }
    add('circuit', 'rcCircuit', 'RC 暫態電路', 300, 190, function (ctx, item) {
        var p = params('rcCircuit', item); var l = -p.width / 2; var r = p.width / 2; var t = -p.height / 2; var b = p.height / 2;
        /* Every wire stops at a component terminal; no hidden bypass lines. */
        stroke(ctx, [[l, t], [-38, t]]); stroke(ctx, [[38, t], [r, t]]);
        drawTaiwanResistor(ctx, -38, 38, t, p.showValues ? 'R = ' + p.resistance + ' kΩ' : 'R');
        stroke(ctx, [[r, t], [r, -10]]); stroke(ctx, [[r - 22, -10], [r + 22, -10]]);
        stroke(ctx, [[r - 22, 10], [r + 22, 10]]); stroke(ctx, [[r, 10], [r, b]]); text(ctx, p.showValues ? 'C = ' + p.capacitance + ' μF' : 'C', r - 32, 0, 13, 'right');
        if (p.circuitMode === 0) {
            stroke(ctx, [[l, t], [l, -9]]); stroke(ctx, [[l - 22, -9], [l + 22, -9]]);
            stroke(ctx, [[l - 13, 9], [l + 13, 9]]); stroke(ctx, [[l, 9], [l, b]]); text(ctx, p.showValues ? p.voltage + ' V' : 'ε', l + 29, 0, 13, 'left');
        } else { stroke(ctx, [[l, t], [l, b]]); text(ctx, '初始電容已充電', 0, t + 30, 12); }
        drawScenarioSwitch(ctx, p);
    }, { keywords: ['RC電路', '充電', '放電', '時間常數'], modelNote: '充電情境假設電容起初未充電；放電情境顯示已移除電池的等效電路，假設電容起初已充電。只有閉合開關後才有暫態電流。元件值是題目標示，不會自動產生電壓／電流時間圖。', suppressCommonLabel: true, parametric: circuitScenarioParametric('rcCircuit') });

    add('circuit', 'rlcCircuit', 'RLC／LC 串聯電路', 340, 190, function (ctx, item) {
        var p = params('rlcCircuit', item); var l = -p.width / 2; var r = p.width / 2; var t = -p.height / 2; var b = p.height / 2;
        var resistorX = l + p.width * 0.23;
        var capacitorX = r - p.width * 0.23;
        stroke(ctx, [[l, t], [resistorX - 25, t]]);
        if (p.idealLC) stroke(ctx, [[resistorX - 25, t], [resistorX + 25, t]]);
        else drawTaiwanResistor(ctx, resistorX - 25, resistorX + 25, t, p.showValues ? 'R=' + p.resistance + ' Ω' : 'R');
        stroke(ctx, [[resistorX + 25, t], [-32, t]]);
        library.drawInductorWinding(ctx, 64, 4, 0, t);
        text(ctx, p.showValues ? 'L=' + p.inductance + ' mH' : 'L', 0, t - 27, 12);
        stroke(ctx, [[32, t], [capacitorX - 8, t]]);
        stroke(ctx, [[capacitorX - 8, t - 22], [capacitorX - 8, t + 22]]);
        stroke(ctx, [[capacitorX + 8, t - 22], [capacitorX + 8, t + 22]]);
        stroke(ctx, [[capacitorX + 8, t], [r, t], [r, b]]);
        text(ctx, p.showValues ? 'C=' + p.capacitance + ' μF' : 'C', capacitorX, t - 33, 12);
        if (p.circuitMode === 0) {
            stroke(ctx, [[l, t], [l, -25]]); stroke(ctx, [[l, 25], [l, b]]);
            circle(ctx, l, 0, 25, true);
            library.drawACSine(ctx, l, 0, 30, 10);
            if (p.showValues) { text(ctx, p.voltage + ' V（有效值）', l + 38, -10, 12, 'left'); text(ctx, 'f = ' + p.frequency + ' Hz', l + 38, 12, 12, 'left'); }
        } else { stroke(ctx, [[l, t], [l, b]]); text(ctx, '初始電容已充電', 0, 0, 12); }
        drawScenarioSwitch(ctx, p);
    }, { keywords: ['RLC電路', '交流電路', '共振', 'LC振盪'], modelNote: '可切換交流驅動／無外電源，以及 RLC／理想 LC。無外電源時假設電容起初已充電、電感電流為零；RLC 不一定產生振盪，須依阻尼條件判斷。本素材為接線題圖，不計算振幅、相位或共振曲線。', suppressCommonLabel: true, parametric: circuitScenarioParametric('rlcCircuit') });

    function meterExperimentState(item) {
        var p = params('meterExperimentCircuit', item); var l = -p.width / 2;
        var resistorX = l + p.width * 0.68;
        var branchLeft = p.connectionMode ? l + 34 : resistorX - 38;
        return { p: p, l: l, r: p.width / 2, t: -p.height / 2, b: p.height / 2,
            ammeterX: l + p.width * 0.24, resistorX: resistorX, branchLeft: branchLeft,
            branchRight: resistorX + 38, voltmeterX: (branchLeft + resistorX + 38) / 2, voltmeterY: 8 };
    }
    var meterExperimentParametric = smart(
        { width: 300, height: 130, connectionMode: 0, sourcePolarity: 1, showPolarity: 0, showMeterLabels: 1 },
        [control('width', '電路圖寬', 300, 390, 1, 'px'), control('height', '電路圖高', 110, 240, 1, 'px'),
            choice('connectionMode', '電壓表跨接範圍', [{ value: 0, label: '只跨 R（安培計外接）' }, { value: 1, label: '跨 A 與 R（安培計內接）' }]),
            choice('sourcePolarity', '電源正極', [{ value: 1, label: '上方' }, { value: -1, label: '下方' }]),
            choice('showMeterLabels', '電表種類', [{ value: 1, label: '顯示 A／V' }, { value: 0, label: '留白（學生填入）' }]),
            choice('showPolarity', '電表正負端標示', [{ value: 0, label: '隱藏' }, { value: 1, label: '顯示' }])],
        {
            getControls: function (item) {
                var p = params('meterExperimentCircuit', item);
                return meterExperimentParametric.controls.filter(function (c) { return c.key !== 'showPolarity' || p.showMeterLabels; });
            },
            bounds: function (item) {
                var s = meterExperimentState(item);
                return { left: s.l - 50, top: s.t - 48, right: s.r + 20, bottom: s.b + 28 };
            },
            handles: function (item) {
                var s = meterExperimentState(item);
                return [{ id: 'size', label: '電路圖寬高', x: s.r, y: s.b, primary: true }];
            },
            update: function (item, id, point) {
                if (id !== 'size') return null;
                var p = params('meterExperimentCircuit', item);
                p.width = Math.abs(point.x) * 2; p.height = Math.abs(point.y) * 2;
                item.params = library.sanitizeParams('meterExperimentCircuit', p);
                return { readout: item.params.width + ' × ' + item.params.height + ' px' };
            }
        }
    );
    add('circuit', 'meterExperimentCircuit', '電流電壓測量接線', 360, 230, function (ctx, item) {
        var s = meterExperimentState(item); var p = s.p; var l = s.l; var r = s.r; var t = s.t; var b = s.b;
        var ammeterX = s.ammeterX; var resistorX = s.resistorX;
        var resistorLeft = resistorX - 38;
        var resistorRight = resistorX + 38;
        var voltmeterY = s.voltmeterY;
        stroke(ctx, [[l, t], [ammeterX - 25, t]]);
        circle(ctx, ammeterX, t, 25, true);
        if (p.showMeterLabels) text(ctx, 'A', ammeterX, t, 18);
        stroke(ctx, [[ammeterX + 25, t], [resistorLeft, t]]);
        drawTaiwanResistor(ctx, resistorLeft, resistorRight, t, 'R');
        stroke(ctx, [[resistorRight, t], [r, t], [r, b], [l, b], [l, 12]]);
        stroke(ctx, [[l, t], [l, -12]]);
        stroke(ctx, [[l - 22, -12 * p.sourcePolarity], [l + 22, -12 * p.sourcePolarity]]);
        stroke(ctx, [[l - 13, 12 * p.sourcePolarity], [l + 13, 12 * p.sourcePolarity]]);
        text(ctx, 'ε', p.connectionMode ? l - 36 : l + 30, 0, 14);
        circle(ctx, s.voltmeterX, voltmeterY, 25, true);
        if (p.showMeterLabels) text(ctx, 'V', s.voltmeterX, voltmeterY, 18);
        stroke(ctx, [[s.branchLeft, t], [s.branchLeft, voltmeterY], [s.voltmeterX - 25, voltmeterY]]);
        stroke(ctx, [[s.branchRight, t], [s.branchRight, voltmeterY], [s.voltmeterX + 25, voltmeterY]]);
        dot(ctx, s.branchLeft, t, 3); dot(ctx, s.branchRight, t, 3);
        if (p.showMeterLabels && p.showPolarity) {
            var leftSign = p.sourcePolarity === 1 ? '+' : '−'; var rightSign = p.sourcePolarity === 1 ? '−' : '+';
            text(ctx, leftSign, ammeterX - 18, t - 36, 13); text(ctx, rightSign, ammeterX + 18, t - 36, 13);
            text(ctx, leftSign, s.voltmeterX - 18, voltmeterY + 36, 13); text(ctx, rightSign, s.voltmeterX + 18, voltmeterY + 36, 13);
        }
    }, { keywords: ['電表接線', '安培計', '伏特計', '歐姆定律實驗', '內接', '外接'], modelNote: '直流電阻測量接線示意。V 只跨 R 時，A 讀到電阻與電壓表的電流總和；V 跨 A 與 R 時，V 讀到兩者電壓降之和。若電表內阻不可忽略，前者以 V/A 算得偏小、後者偏大；理想電表極限才都等於 R。正負端跟隨電池長線正極，留白模式同時隱藏電表種類與端子答案。圖寬高只供排圖，未計算讀數，亦非實體電表插孔配置；JSON 仍保留隱藏答案設定。', suppressCommonLabel: true, parametric: meterExperimentParametric });

    /* Wave and optics construction tools. */
    var principalAxisParametric = smart(
        { length: 260 }, [control('length', '主軸長度', 100, 650, 1, 'px')],
        {
            bounds: function (item) { var p = params('principalAxis', item); return { left: -p.length / 2 - 6, top: -12, right: p.length / 2 + 6, bottom: 12 }; },
            handles: function (item) { var p = params('principalAxis', item); return [{ id: 'end', label: '主軸長度', x: p.length / 2, y: 0, primary: true, readout: 'L ' + p.length + ' px' }]; },
            update: function (item, id, point) { if (id !== 'end') return null; var p = params('principalAxis', item); p.length = clamp(Math.abs(point.x) * 2, 100, 650, p.length); item.params = library.sanitizeParams('principalAxis', p); return { readout: 'L ' + Math.round(item.params.length) + ' px' }; }
        }
    );
    add('waves', 'principalAxis', '光學主軸', 260, 24, function (ctx, item) { var p = params('principalAxis', item); dashed(ctx, [[-p.length / 2, 0], [p.length / 2, 0]]); }, { keywords: ['主軸', '光軸'], suppressCommonLabel: true, parametric: principalAxisParametric });

    add('waves', 'focalMarker', '焦點 F／2F／C', 54, 54, function (ctx, item) {
        var p = params('focalMarker', item); dot(ctx, 0, 0, p.radius); text(ctx, Object.prototype.hasOwnProperty.call(item, 'label') ? item.label : 'F', 0, 18 + p.radius, 15);
    }, { defaultLabel: 'F', keywords: ['焦點', 'F', '2F', '曲率中心', 'C'], suppressCommonLabel: true, parametric: Object.assign(radiusSmart('focalMarker', 4, 3, 9, '標記大小'), { bounds: function (item) { var p = params('focalMarker', item); return { left: -28, right: 28, top: -p.radius - 8, bottom: p.radius + 31 }; } }) });

    var opticalObjectParametric = smart(
        { height: 90, virtual: 0 }, [control('height', '箭頭高度（正立為正）', -170, 170, 1, 'px'), choice('virtual', '線型', [{ value: 0, label: '實線（物體／實像）' }, { value: 1, label: '虛線（虛像）' }])],
        {
            bounds: function (item) { var p = params('opticalObject', item); return { left: -20, top: Math.min(-p.height, 0) - 14, right: 44, bottom: Math.max(-p.height, 0) + 14 }; },
            handles: function (item) { var p = params('opticalObject', item); return [{ id: 'tip', label: '物高', x: 0, y: -p.height, primary: true, readout: 'h ' + p.height + ' px' }]; },
            update: function (item, id, point) { if (id !== 'tip') return null; var p = params('opticalObject', item); p.height = clamp(-point.y, -170, 170, p.height); item.params = library.sanitizeParams('opticalObject', p); return { readout: 'h ' + Math.round(item.params.height) + ' px' }; }
        }
    );
    add('waves', 'opticalObject', '物體／像箭頭', 60, 230, function (ctx, item) { var p = params('opticalObject', item); ctx.save(); if (p.virtual) ctx.setLineDash([5, 4]); if (p.height) arrow(ctx, 0, 0, 0, -p.height, Math.min(9, Math.abs(p.height) / 2)); ctx.restore(); text(ctx, Object.prototype.hasOwnProperty.call(item, 'label') ? item.label : '物', 16, -p.height * 0.55, 15, 'left'); }, { defaultLabel: '物', keywords: ['物體箭頭', '實像', '虛像', '物高', '像高'], modelNote: '獨立組裝符號，底部固定、箭端可上下拖曳；正負高度表示正立或倒立，零高度不畫假箭頭。實／虛線需由老師依題設選擇，並不會自動依附透鏡或判斷成像。', suppressCommonLabel: true, parametric: opticalObjectParametric });

    function boundaryRayState(item) {
        var p = params(item.type, item), side = item.type === 'totalInternalReflection' ? 1 : -1;
        var i = p.incident * DEG, ratio = p.n1 / p.n2 * Math.sin(i);
        return { p: p, side: side, i: i, ratio: ratio, tir: ratio > 1 + 1e-12, r: Math.asin(Math.min(1, ratio)), extent: Math.max(150, p.length + 18) };
    }
    function boundaryRayParametric(type, lower) {
        return smart(
            { incident: lower ? 55 : 42, n1: lower ? 1.5 : 1, n2: lower ? 1 : 1.5, length: 105, solutionMode: 1, showNormal: 1, showReflection: 1, showAngles: 0 },
            [control('incident', '入射角（相對法線）', 0, 85, .1, '°'), control('n1', '入射側折射率', 1, 2.5, .05, ''), control('n2', '透射側折射率', 1, 2.5, .05, ''), control('length', '光線顯示長度', 60, 180, 1, 'px'), solutionControl(), choice('showNormal', '法線', [{ value: 0, label: '隱藏' }, { value: 1, label: '顯示' }]), choice('showReflection', '反射光線（若存在）', [{ value: 0, label: '隱藏' }, { value: 1, label: '顯示' }]), choice('showAngles', '角度與判定解答', [{ value: 0, label: '隱藏' }, { value: 1, label: '顯示' }])],
            {
                bounds: function (item) { var s = boundaryRayState(item); return { left: -s.extent - 12, right: s.extent + 12, top: -s.p.length - 20, bottom: s.p.length + 48 }; },
                handles: function (item) { var s = boundaryRayState(item); return [{ id: 'incident', label: '入射角（長度固定）', x: -Math.sin(s.i) * s.p.length, y: s.side * Math.cos(s.i) * s.p.length, primary: true, readout: 'i ' + s.p.incident + '°' }]; },
                update: function (item, id, point) { if (id !== 'incident') return null; var s = boundaryRayState(item); s.p.incident = Math.atan2(Math.max(0, -point.x), Math.max(0, s.side * point.y)) / DEG; item.params = library.sanitizeParams(type, s.p); return { readout: 'i ' + item.params.incident + '°' }; }
            }
        );
    }
    function drawBoundaryRays(ctx, item) {
        var s = boundaryRayState(item), p = s.p, sy = s.side;
        stroke(ctx, [[-s.extent, 0], [s.extent, 0]]);
        if (p.showNormal) dashed(ctx, [[0, -p.length - 8], [0, p.length + 8]]);
        arrow(ctx, -Math.sin(s.i) * p.length, sy * Math.cos(s.i) * p.length, 0, 0, 8);
        text(ctx, 'n=' + p.n1.toFixed(2), -s.extent + 8, sy * 19, 13, 'left');
        text(ctx, 'n=' + p.n2.toFixed(2), -s.extent + 8, -sy * 19, 13, 'left');
        if (!p.solutionMode) return;
        // Equal-index media have no reflecting boundary in this ideal model.
        if (p.showReflection && Math.abs(p.n1 - p.n2) > 1e-12) arrow(ctx, 0, 0, Math.sin(s.i) * p.length, sy * Math.cos(s.i) * p.length, 8);
        if (!s.tir) arrow(ctx, 0, 0, Math.sin(s.r) * p.length, -sy * Math.cos(s.r) * p.length, 8);
        if (p.showAngles) {
            var result = s.tir ? '全反射' : Math.abs(s.r - Math.PI / 2) < 1e-8 ? '臨界折射（r = 90°）' : 'r = ' + (s.r / DEG).toFixed(1) + '°';
            text(ctx, 'i = ' + p.incident + '°；' + result, 0, p.length + 25, 12);
        }
    }
    var boundaryNote = '理想非吸收介質的平面介面，入射角相對法線；依 Snell 定律決定折射。相同折射率不畫反射線，臨界狀態沿界面折射，超过臨界才是全反射。此為幾何方向圖，不計反射率、偏振或光強。拖入射端只改角度，長度由數值欄調整；題目模式只留題設入射光、折射率及可選法線，隐藏反射、折射與判定答案。';
    add('waves', 'refractionDiagram', '折射光線作圖', 300, 280, drawBoundaryRays, { keywords: ['折射', '司乃耳定律', '入射角', '折射角', '反射'], modelNote: boundaryNote, suppressCommonLabel: true, parametric: boundaryRayParametric('refractionDiagram', false) });
    add('waves', 'totalInternalReflection', '折射／全反射判定圖', 300, 250, drawBoundaryRays, { keywords: ['折射判定', '全反射', '臨界角', '光纖'], modelNote: boundaryNote, suppressCommonLabel: true, parametric: boundaryRayParametric('totalInternalReflection', true) });

    function lensImageState(item) {
        var p = params('lensRayDiagram', item);
        var denominator = p.objectDistance - p.focalLength;
        var atInfinity = Math.abs(denominator) < 1e-9;
        var imageDistance = atInfinity ? Infinity : p.focalLength * p.objectDistance / denominator;
        var imageY = atInfinity ? 0 : p.objectHeight * imageDistance / p.objectDistance;
        var parallelEndX = Math.min(300, (145 + p.objectHeight) * p.focalLength / p.objectHeight);
        var centralEndX = Math.min(300, 145 * p.objectDistance / p.objectHeight);
        return {
            p: p,
            objectX: -p.objectDistance,
            imageX: imageDistance,
            imageY: imageY,
            imageVisible: !atInfinity && Math.abs(imageDistance) <= 300 && Math.abs(imageY) <= 145,
            atInfinity: atInfinity,
            parallelEnd: { x: parallelEndX, y: -p.objectHeight + p.objectHeight / p.focalLength * parallelEndX },
            centralEnd: { x: centralEndX, y: p.objectHeight / p.objectDistance * centralEndX }
        };
    }
    var lensRayParametric = smart(
        { objectDistance: 150, focalLength: 62, objectHeight: 72, solutionMode: 1, showFoci: 1 },
        [control('objectDistance', '物距', 35, 280, 1, 'px'), control('focalLength', '焦距', 28, 120, 1, 'px'), control('objectHeight', '物高', 25, 130, 1, 'px'), solutionControl(), focusControl()],
        {
            bounds: defaultBounds(650, 350, 8),
            handles: function (item) { var s = lensImageState(item); return [{ id: 'object', label: '物體', x: s.objectX, y: -s.p.objectHeight, primary: true, readout: 'u ' + s.p.objectDistance + ' · h ' + s.p.objectHeight }, { id: 'focus', label: '焦距', x: s.p.focalLength, y: 0, readout: 'f ' + s.p.focalLength }]; },
            update: function (item, id, point) { var p = params('lensRayDiagram', item); if (id === 'object') { p.objectDistance = clamp(-point.x, 35, 280, p.objectDistance); p.objectHeight = clamp(-point.y, 25, 130, p.objectHeight); } else if (id === 'focus') p.focalLength = clamp(Math.abs(point.x), 28, 120, p.focalLength); else return null; item.params = library.sanitizeParams('lensRayDiagram', p); return { readout: 'u ' + Math.round(item.params.objectDistance) + ' · f ' + Math.round(item.params.focalLength) }; }
        }
    );
    add('waves', 'lensRayDiagram', '凸透鏡成像智慧圖', 650, 330, function (ctx, item) {
        var s = lensImageState(item); var p = s.p;
        dashed(ctx, [[-315, 0], [315, 0]]);
        var halfLens = Math.max(105, p.objectHeight + 18);
        begin(ctx); ctx.moveTo(0, -halfLens); ctx.bezierCurveTo(24, -halfLens / 2, 24, halfLens / 2, 0, halfLens); ctx.bezierCurveTo(-24, halfLens / 2, -24, -halfLens / 2, 0, -halfLens); ctx.closePath(); ctx.fill(); ctx.stroke();
        if (p.showFoci) [-2, -1, 1, 2].forEach(function (m) { dot(ctx, m * p.focalLength, 0, 3); text(ctx, Math.abs(m) === 1 ? 'F' : '2F', m * p.focalLength, 16, 13); });
        arrow(ctx, s.objectX, 0, s.objectX, -p.objectHeight, 9); text(ctx, '物', s.objectX - 14, -p.objectHeight / 2, 14);
        if (!p.solutionMode) return;
        if (s.imageVisible) {
            if (s.imageX < 0) { ctx.save(); ctx.setLineDash([6, 5]); arrow(ctx, s.imageX, 0, s.imageX, s.imageY, 9); ctx.restore(); }
            else arrow(ctx, s.imageX, 0, s.imageX, s.imageY, 9);
            text(ctx, s.imageX < 0 ? '虛像' : '實像', s.imageX + 16, s.imageY / 2, 13, 'left');
        } else text(ctx, s.atInfinity ? '像在無窮遠' : '像在畫面外', 205, -145, 14);

        /* Actual rays always continue to the right of the converging lens. */
        arrow(ctx, s.objectX, -p.objectHeight, 0, -p.objectHeight, 7);
        arrow(ctx, 0, -p.objectHeight, s.parallelEnd.x, s.parallelEnd.y, 7);
        arrow(ctx, s.objectX, -p.objectHeight, 0, 0, 7);
        arrow(ctx, 0, 0, s.centralEnd.x, s.centralEnd.y, 7);

        /* Only the backward construction line of a virtual image is dashed. */
        if (s.imageVisible && s.imageX < 0) dashed(ctx, [[0, -p.objectHeight], [s.imageX, s.imageY]]);
    }, { keywords: ['凸透鏡成像', '光線作圖', '物距', '像距', '焦距'], suppressCommonLabel: true, parametric: lensRayParametric });

    function concaveLensImageState(item) {
        var p = params('concaveLensRayDiagram', item);
        var focalLength = -p.focalLength;
        var imageDistance = focalLength * p.objectDistance / (p.objectDistance - focalLength);
        var imageHeight = -p.objectHeight * imageDistance / p.objectDistance;
        var parallelRise = Math.min(105, p.objectHeight * 2);
        var parallelEndX = parallelRise * p.focalLength / p.objectHeight;
        var centralEndX = Math.min(260, 105 * p.objectDistance / p.objectHeight);
        return {
            p: p,
            objectX: -p.objectDistance,
            imageX: imageDistance,
            imageHeight: imageHeight,
            parallelEnd: { x: parallelEndX, y: -p.objectHeight - parallelRise },
            centralEnd: { x: centralEndX, y: p.objectHeight / p.objectDistance * centralEndX }
        };
    }

    function drawConcaveLensOutline(ctx, height) {
        var outer = 24;
        var waist = 12;
        var halfHeight = height / 2;
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
    }

    var concaveLensRayParametric = smart(
        { objectDistance: 180, focalLength: 90, objectHeight: 56, solutionMode: 1, showFoci: 1 },
        [control('objectDistance', '物距', 60, 300, 1, 'px'), control('focalLength', '焦距大小', 30, 130, 1, 'px'), control('objectHeight', '物高', 25, 100, 1, 'px'), solutionControl(), focusControl()],
        {
            bounds: function (item) {
                var state = concaveLensImageState(item);
                return {
                    left: Math.min(-315, state.objectX, -2 * state.p.focalLength, state.imageX) - 34,
                    top: Math.min(-125, -state.p.objectHeight, state.parallelEnd.y, -state.imageHeight) - 24,
                    right: Math.max(315, 2 * state.p.focalLength, state.parallelEnd.x, state.centralEnd.x) + 34,
                    bottom: Math.max(125, state.centralEnd.y, -state.imageHeight) + 24
                };
            },
            handles: function (item) {
                var state = concaveLensImageState(item);
                return [
                    { id: 'object', label: '物體', x: state.objectX, y: -state.p.objectHeight, primary: true, readout: 'u ' + state.p.objectDistance + ' · h ' + state.p.objectHeight },
                    { id: 'focus', label: '焦距', x: -state.p.focalLength, y: 0, readout: '|f| ' + state.p.focalLength }
                ];
            },
            update: function (item, id, point) {
                var p = params('concaveLensRayDiagram', item);
                if (id === 'object') {
                    p.objectDistance = clamp(-point.x, 60, 300, p.objectDistance);
                    p.objectHeight = clamp(-point.y, 25, 100, p.objectHeight);
                } else if (id === 'focus') {
                    p.focalLength = clamp(Math.abs(point.x), 30, 130, p.focalLength);
                } else return null;
                item.params = library.sanitizeParams('concaveLensRayDiagram', p);
                return { readout: 'u ' + Math.round(item.params.objectDistance) + ' · |f| ' + Math.round(item.params.focalLength) };
            }
        }
    );

    add('waves', 'concaveLensRayDiagram', '凹透鏡成像智慧圖', 650, 390, function (ctx, item) {
        var state = concaveLensImageState(item);
        var p = state.p;
        dashed(ctx, [[-315, 0], [315, 0]]);
        drawConcaveLensOutline(ctx, 210);

        if (p.showFoci) [-1, 1].forEach(function (side) {
            dot(ctx, side * p.focalLength, 0, 3);
            text(ctx, 'F', side * p.focalLength, 16, 13);
            dot(ctx, side * 2 * p.focalLength, 0, 3);
            text(ctx, '2F', side * 2 * p.focalLength, 16, 13);
        });

        arrow(ctx, state.objectX, 0, state.objectX, -p.objectHeight, 9);
        text(ctx, '物', state.objectX - 15, -p.objectHeight / 2, 14);
        if (!p.solutionMode) return;
        ctx.save(); ctx.setLineDash([6, 5]); arrow(ctx, state.imageX, 0, state.imageX, -state.imageHeight, 8); ctx.restore();
        text(ctx, '虛像', state.imageX + 16, -state.imageHeight / 2 - 12, 13, 'left');

        arrow(ctx, state.objectX, -p.objectHeight, 0, -p.objectHeight, 7);
        arrow(ctx, 0, -p.objectHeight, state.parallelEnd.x, state.parallelEnd.y, 7);
        arrow(ctx, state.objectX, -p.objectHeight, 0, 0, 7);
        arrow(ctx, 0, 0, state.centralEnd.x, state.centralEnd.y, 7);

        ctx.save();
        ctx.setLineDash([6, 5]);
        stroke(ctx, [[0, -p.objectHeight], [state.imageX, -state.imageHeight]]);
        ctx.restore();
    }, { keywords: ['凹透鏡成像', '發散透鏡', '虛像', '光線作圖', '焦距'], suppressCommonLabel: true, parametric: concaveLensRayParametric });

    function mirrorImageState(item) {
        var p = params('mirrorRayDiagram', item); var denominator = p.objectDistance - p.focalLength;
        var atInfinity = Math.abs(denominator) < 1e-9;
        var imageDistance = atInfinity ? Infinity : p.focalLength * p.objectDistance / denominator;
        var imageX = -imageDistance;
        var imageY = atInfinity ? 0 : p.objectHeight * imageDistance / p.objectDistance;
        var parallelEndX = -Math.min(300, (145 + p.objectHeight) * p.focalLength / p.objectHeight);
        var centralEndX = -Math.min(300, 145 * p.objectDistance / p.objectHeight);
        return {
            p: p,
            objectX: -p.objectDistance,
            imageX: imageX,
            imageY: imageY,
            imageVisible: !atInfinity && Math.abs(imageX) <= 300 && Math.abs(imageY) <= 145,
            atInfinity: atInfinity,
            parallelEnd: { x: parallelEndX, y: -p.objectHeight - p.objectHeight / p.focalLength * parallelEndX },
            centralEnd: { x: centralEndX, y: -p.objectHeight / p.objectDistance * centralEndX }
        };
    }
    var mirrorRayParametric = smart(
        { objectDistance: 170, focalLength: 68, objectHeight: 70, solutionMode: 1, showFoci: 1 },
        [control('objectDistance', '物距', 38, 300, 1, 'px'), control('focalLength', '焦距', 30, 125, 1, 'px'), control('objectHeight', '物高', 25, 125, 1, 'px'), solutionControl(), focusControl()],
        {
            bounds: defaultBounds(650, 370, 8),
            handles: function (item) { var s = mirrorImageState(item); return [{ id: 'object', label: '物體', x: s.objectX, y: -s.p.objectHeight, primary: true, readout: 'u ' + s.p.objectDistance }, { id: 'focus', label: '焦距', x: -s.p.focalLength, y: 0, readout: 'f ' + s.p.focalLength }]; },
            update: function (item, id, point) { var p = params('mirrorRayDiagram', item); if (id === 'object') { p.objectDistance = clamp(-point.x, 38, 300, p.objectDistance); p.objectHeight = clamp(-point.y, 25, 125, p.objectHeight); } else if (id === 'focus') p.focalLength = clamp(Math.abs(point.x), 30, 125, p.focalLength); else return null; item.params = library.sanitizeParams('mirrorRayDiagram', p); return { readout: 'u ' + Math.round(item.params.objectDistance) + ' · f ' + Math.round(item.params.focalLength) }; }
        }
    );
    add('waves', 'mirrorRayDiagram', '凹面鏡成像智慧圖', 650, 330, function (ctx, item) {
        var s = mirrorImageState(item); var p = s.p;
        dashed(ctx, [[-315, 0], [315, 0]]);
        /* The paraxial construction uses the tangent plane at the vertex.
           Its concave-mirror symbol is not a scaled circular optical surface. */
        var mirrorHeight = Math.max(105, p.objectHeight + 18);
        stroke(ctx, [[0, -mirrorHeight], [0, mirrorHeight]]);
        stroke(ctx, [[-12, -mirrorHeight - 10], [0, -mirrorHeight], [0, mirrorHeight], [-12, mirrorHeight + 10]]);
        for (var y = -mirrorHeight + 6; y <= mirrorHeight - 6; y += 15) stroke(ctx, [[0, y], [10, y + 7]]);
        text(ctx, '近軸凹面鏡（符號示意）', 110, mirrorHeight + 22, 12);
        if (p.showFoci) { dot(ctx, -p.focalLength, 0, 3); text(ctx, 'F', -p.focalLength, 16, 13); dot(ctx, -2 * p.focalLength, 0, 3); text(ctx, 'C', -2 * p.focalLength, 16, 13); }
        arrow(ctx, s.objectX, 0, s.objectX, -p.objectHeight, 9); text(ctx, '物', s.objectX - 14, -p.objectHeight / 2, 14);
        if (!p.solutionMode) return;
        if (s.imageVisible) {
            if (s.imageX > 0) { ctx.save(); ctx.setLineDash([6, 5]); arrow(ctx, s.imageX, 0, s.imageX, s.imageY, 9); ctx.restore(); }
            else arrow(ctx, s.imageX, 0, s.imageX, s.imageY, 9);
            text(ctx, s.imageX > 0 ? '虛像' : '實像', s.imageX + 14, s.imageY / 2, 14);
        } else text(ctx, s.atInfinity ? '像在無窮遠' : '像在畫面外', 205, -145, 14);

        /* Incident rays travel to the mirror; reflected rays remain on the left. */
        arrow(ctx, s.objectX, -p.objectHeight, 0, -p.objectHeight, 7);
        arrow(ctx, 0, -p.objectHeight, s.parallelEnd.x, s.parallelEnd.y, 7);
        arrow(ctx, s.objectX, -p.objectHeight, 0, 0, 7);
        arrow(ctx, 0, 0, s.centralEnd.x, s.centralEnd.y, 7);
        if (s.imageVisible && s.imageX > 0) {
            dashed(ctx, [[0, -p.objectHeight], [s.imageX, s.imageY]]);
            dashed(ctx, [[0, 0], [s.imageX, s.imageY]]);
        }
    }, { keywords: ['凹面鏡成像', '光線作圖', '曲率中心', '焦距'], modelNote: '近軸成像圖：光線以鏡頂切平面作圖，鏡面符號不代表按比例的球面。像超出圖框時明示畫面外，不等於無窮遠。', suppressCommonLabel: true, parametric: mirrorRayParametric });

    function standingModeControl(maximum, mixed) {
        var entries = [];
        for (var k = 1; k <= maximum; k++) entries.push({ value: k, label: '第 ' + k + ' 模態（第 ' + (mixed ? 2 * k - 1 : k) + ' 諧波）' });
        return choice('harmonic', '共鳴模態序號', entries);
    }

    function standingState(type, item) {
        var p = params(type, item), isString = type === 'standingWave';
        var leftFixed = isString ? p.boundary === 0 || p.boundary === 1 : type === 'closedPipeStandingWave';
        var rightFixed = isString ? p.boundary === 0 || p.boundary === 2 : false;
        var mixed = leftFixed !== rightFixed, order = mixed ? 2 * p.harmonic - 1 : p.harmonic;
        var phaseSpan = Math.PI * order / (mixed ? 2 : 1);
        var pressure = !isString && p.waveQuantity === 1;
        // Normalized Δp = -dξ/dx / |kξ|, preserving the relative sign.
        var sine = pressure ? !leftFixed : leftFixed, sign = pressure && leftFixed ? -1 : 1;
        var frameHeight = isString ? (p.solutionMode ? p.amplitude + 12 : 56) : (p.solutionMode ? Math.max(45, p.amplitude + 12) : 45);
        var quantity = isString ? '弦的橫向位移' : (pressure ? '壓力變化 Δp（非總壓力）' : '空氣縱向位移（非橫向軌跡）');
        var footer = [quantity + (p.solutionMode ? '' : '／作圖區')];
        if (p.solutionMode && p.showMode) footer.push('模態 ' + p.harmonic + ' · 第 ' + order + ' 諧波 · λ = ' + (mixed ? '4L/' : '2L/') + order);
        if (p.solutionMode && (p.showOpposite || p.showNodes)) footer.push((p.showOpposite ? '實／虛線：相隔半週期' : '') + (p.showNodes ? (p.showOpposite ? '；' : '') + '圓點：波節' : ''));
        return { p: p, isString: isString, leftFixed: leftFixed, rightFixed: rightFixed, mixed: mixed, order: order, phaseSpan: phaseSpan, sine: sine, sign: sign, pressure: pressure, left: p.startX, right: p.startX + p.length, center: p.startX + p.length / 2, frameHeight: frameHeight, footer: footer };
    }

    function standingShape(state, fraction) {
        return state.sign * (state.sine ? Math.sin(state.phaseSpan * fraction) : Math.cos(state.phaseSpan * fraction));
    }

    function standingParametric(type) {
        var isString = type === 'standingWave', closed = type === 'closedPipeStandingWave';
        var maxMode = isString ? 8 : 7, minLength = isString ? 120 : 130, maxLength = isString ? 460 : 430;
        var minAmplitude = isString ? 18 : 15, maxAmplitude = isString ? 85 : 55;
        var defaults = { length: 250, harmonic: isString ? 3 : 1, amplitude: isString ? 44 : 32, startX: null, solutionMode: 1, showNodes: 1, showOpposite: 1, showMode: isString ? 0 : 1 };
        if (isString) defaults.boundary = 0; else defaults.waveQuantity = 0;
        var controls = [control('length', isString ? '弦長（圖示）' : '氣柱長度（圖示）', minLength, maxLength, 1, 'px')];
        if (isString) controls.push(choice('boundary', '弦的端點條件', [{ value: 0, label: '兩端固定' }, { value: 1, label: '左固定、右自由' }, { value: 2, label: '左自由、右固定' }, { value: 3, label: '兩端自由（理想滑環）' }]));
        else controls.push(choice('waveQuantity', '縱軸表示的物理量', [{ value: 0, label: '空氣縱向位移' }, { value: 1, label: '壓力變化 Δp' }]));
        controls.push(standingModeControl(maxMode, closed), control('amplitude', '波形圖高（波腹）', minAmplitude, maxAmplitude, 1, 'px'), solutionControl(),
            choice('showNodes', '波節標示', [{ value: 0, label: '隱藏圓點' }, { value: 1, label: '顯示目前物理量的波節' }]),
            choice('showOpposite', '半週期後的波形', [{ value: 0, label: '只畫一個極端狀態' }, { value: 1, label: '另畫虛線極端狀態' }]),
            choice('showMode', '模態與波長解答', [{ value: 0, label: '隱藏' }, { value: 1, label: '顯示模態、諧波與 λ' }]));
        return smart(defaults, controls, {
            sanitize: function (source) {
                var src = source || {}, p = {};
                controls.forEach(function (c) { p[c.key] = Math.round(clamp(src[c.key], c.min, c.max, defaults[c.key])); });
                p.startX = src.startX == null ? -p.length / 2 : clamp(src.startX, -maxLength / 2, -minLength / 2, -p.length / 2);
                return p;
            },
            getControls: function (item) {
                var s = standingState(type, item);
                return controls.filter(function (c) { return s.p.solutionMode || ['amplitude', 'showNodes', 'showOpposite', 'showMode'].indexOf(c.key) < 0; }).map(function (c) { return c.key === 'harmonic' ? standingModeControl(maxMode, s.mixed) : c; });
            },
            bounds: function (item) {
                var s = standingState(type, item);
                return { left: Math.min(s.left - 28, s.center - 148), right: Math.max(s.right + 28, s.center + 148), top: -s.frameHeight - 10, bottom: s.frameHeight + 50 + 20 * (s.footer.length - 1) };
            },
            handles: function (item) {
                var s = standingState(type, item), p = s.p;
                var handles = [{ id: 'length', label: '右端／長度', x: s.right, y: s.frameHeight, primary: true, readout: 'L ' + p.length + ' px；左端固定' }];
                if (p.solutionMode) handles.push({ id: 'amplitude', label: s.pressure ? '壓力圖高（波腹）' : '位移圖高（波腹）', x: s.left + p.length * (s.sine ? Math.PI / (2 * s.phaseSpan) : 0), y: -p.amplitude * s.sign, readout: '圖高 ' + p.amplitude + ' px（非物理振幅單位）' });
                return handles;
            },
            update: function (item, id, point) {
                var s = standingState(type, item), p = s.p;
                if (id === 'length') p.length = point.x - s.left;
                else if (id === 'amplitude' && p.solutionMode) p.amplitude = -point.y / s.sign;
                else return null;
                item.params = library.sanitizeParams(type, p);
                return { readout: id === 'length' ? 'L ' + item.params.length + ' px' : '圖高 ' + item.params.amplitude + ' px' };
            }
        });
    }

    function drawStandingWave(ctx, item, type) {
        var s = standingState(type, item), p = s.p, h = s.frameHeight;
        if (s.isString) {
            [[s.left, s.leftFixed, -1], [s.right, s.rightFixed, 1]].forEach(function (end) {
                if (end[1]) {
                    stroke(ctx, [[end[0], -h], [end[0], h]]);
                    for (var y = -h + 8; y <= h; y += 12) stroke(ctx, [[end[0], y], [end[0] + end[2] * 8, y - 6]]);
                } else dashed(ctx, [[end[0], -h], [end[0], h]]);
            });
        } else {
            stroke(ctx, [[s.left, -h], [s.right, -h]]); stroke(ctx, [[s.left, h], [s.right, h]]);
            if (s.leftFixed) stroke(ctx, [[s.left, -h], [s.left, h]]);
        }
        if (p.solutionMode) {
            function extreme(sign) {
                var count = Math.max(160, Math.ceil(s.phaseSpan / Math.PI * 48));
                begin(ctx);
                for (var i = 0; i <= count; i++) {
                    var x = s.left + p.length * i / count, y = sign * p.amplitude * standingShape(s, i / count);
                    if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.stroke();
            }
            extreme(-1);
            if (p.showOpposite) { ctx.save(); ctx.setLineDash([6, 5]); extreme(1); ctx.restore(); }
            if (p.showNodes) {
                for (var angle = s.sine ? 0 : Math.PI / 2; angle <= s.phaseSpan + 1e-8; angle += Math.PI) dot(ctx, s.left + p.length * angle / s.phaseSpan, 0, 3);
            }
        } else dashed(ctx, [[s.left, 0], [s.right, 0]]);
        if (s.isString) {
            [[s.left, s.leftFixed, 0], [s.right, s.rightFixed, 1]].forEach(function (end) {
                if (end[1]) return;
                var y = p.solutionMode ? -p.amplitude * standingShape(s, end[2]) : 0;
                circle(ctx, end[0], y, 4, true);
                if (p.solutionMode && p.showOpposite) { ctx.save(); ctx.setLineDash([3, 3]); circle(ctx, end[0], -y, 4, false); ctx.restore(); }
            });
        }
        text(ctx, s.isString ? (s.leftFixed ? '固定端' : '自由端') : (s.leftFixed ? '閉端' : '開端'), s.left, h + 18, 12);
        text(ctx, s.isString ? (s.rightFixed ? '固定端' : '自由端') : '開端', s.right, h + 18, 12);
        s.footer.forEach(function (line, index) { text(ctx, line, s.center, h + 38 + 20 * index, 11); });
    }

    add('waves', 'standingWave', '弦上駐波', 290, 150, function (ctx, item) { drawStandingWave(ctx, item, 'standingWave'); }, {
        keywords: ['駐波', '節點', '腹點', '弦振動', '諧波', '自由端'], suppressCommonLabel: true, parametric: standingParametric('standingWave'),
        modelNote: '理想弦的橫向位移：固定端為波節，自由端為波腹（以無摩擦滑環表示）。兩端同類時第 k 模態為第 k 諧波；一固定一自由時為第 2k−1 諧波。兩端自由不包含整體平移的零頻模態。實／虛線是相隔半週期的兩個極端位置，不是兩條弦或兩個行波。可關閉波節、第二狀態與模態答案；題目模式全部隱藏，只留端點及作圖基準。圖高與弦長為 px 排圖，未輸入張力、線密度或真實長度，不計算 Hz。拖右端固定左端。'
    });
    ['openPipeStandingWave', 'closedPipeStandingWave'].forEach(function (type) {
        add('waves', type, type === 'openPipeStandingWave' ? '開管駐波' : '閉管駐波', 300, 150, function (ctx, item) { drawStandingWave(ctx, item, type); }, {
            keywords: ['開管', '閉管', '氣柱共鳴', '駐波', '壓力', '位移'], suppressCommonLabel: true, parametric: standingParametric(type),
            modelNote: '可切換空氣縱向位移與壓力變化 Δp：理想開端為位移波腹／壓力波節，閉端相反。壓力不是總壓力，負值表示低於平衡壓力。波節圓點隨物理量切換，兩種曲線各自正規化，不可用同一 px 圖高比較物理振幅。實／虛線相隔半週期，空氣並非在管內上下運動。開管第 k 模態為第 k 諧波；一端閉管為第 2k−1 諧波。忽略端修正、損耗與溫度變化；圖長不代表實際公尺，未計算 Hz。管框自動留圖形空間，不表示管徑隨振幅改變。題目模式隱藏波形、波節、模態與 λ；拖右下角固定左端。'
        });
    });

    function longitudinalState(item) {
        var p = params('longitudinalWave', item), samples = [], best = null;
        for (var i = 0; i < p.particles; i++) {
            var base = p.startX + p.length * i / (p.particles - 1);
            var coefficient = Math.sin(2 * Math.PI * (base - p.startX) / p.wavelength + p.phase * DEG);
            var sample = { index: i + 1, base: base, coefficient: coefficient, x: base + p.amplitude * coefficient };
            samples.push(sample);
            if (!best || Math.abs(coefficient) > Math.abs(best.coefficient)) best = sample;
        }
        var marked = p.markedParticle ? samples[p.markedParticle - 1] : null;
        return { p: p, samples: samples, marked: marked, amplitudeSample: marked || best,
            right: p.startX + p.length, center: p.startX + p.length / 2,
            wavelengthStart: samples[0].x, showWavelength: Boolean(p.solutionMode && p.showWavelength && p.amplitude > 0 && p.length >= p.wavelength) };
    }
    var longitudinalParametric = smart(
        { length: 280, particles: 44, wavelength: 95, amplitude: 16, phase: 0, startX: null,
            direction: 0, showEquilibrium: 0, markedParticle: 0, showDisplacement: 1, showRegions: 1, showWavelength: 1, solutionMode: 1 },
        [control('length', '平衡位置樣本範圍', 150, 450, 1, 'px'), control('particles', '代表粒子數量', 24, 72, 1, '個'),
            control('wavelength', '波長（圖示）', 55, 170, 1, 'px'), control('amplitude', '位移振幅（有不交叉上限）', 0, 28, 0.1, 'px'),
            control('phase', '左端初相位', -180, 180, 1, '°'),
            choice('direction', '指定波的傳播方向', [{ value: 0, label: '不標示' }, { value: 1, label: '向右' }, { value: -1, label: '向左' }]),
            choice('showEquilibrium', '平衡位置對照列', [{ value: 0, label: '隱藏' }, { value: 1, label: '顯示上排十字' }]),
            control('markedParticle', '標記粒子 P（0 為不標記）', 0, 72, 1, ''), solutionControl(),
            choice('showDisplacement', 'P 的位移（不是速度）', [{ value: 0, label: '隱藏' }, { value: 1, label: '顯示位移箭頭' }]),
            choice('showRegions', '疏部／密部答案', [{ value: 0, label: '隱藏' }, { value: 1, label: '顯示' }]),
            choice('showWavelength', '波長標示', [{ value: 0, label: '隱藏' }, { value: 1, label: '顯示可見的完整 λ' }])],
        {
            sanitize: function (source) {
                var src = source || {}, p = {};
                longitudinalParametric.controls.forEach(function (c) { p[c.key] = clamp(src[c.key], c.min, c.max, longitudinalParametric.defaults[c.key]); if (c.step >= 1) p[c.key] = Math.round(p[c.key]); });
                p.amplitude = Math.min(p.amplitude, Math.floor(p.wavelength * .85 / (2 * Math.PI)));
                p.markedParticle = Math.min(p.markedParticle, p.particles);
                p.startX = src.startX == null ? -p.length / 2 : clamp(src.startX, -225, -75, -p.length / 2);
                return p;
            },
            getControls: function (item) {
                var p = params('longitudinalWave', item);
                return longitudinalParametric.controls.filter(function (c) {
                    if (!p.solutionMode && ['showDisplacement', 'showRegions', 'showWavelength'].indexOf(c.key) >= 0) return false;
                    return c.key !== 'showDisplacement' || p.markedParticle > 0;
                }).map(function (c) {
                    if (c.key === 'amplitude') return Object.assign({}, c, { max: Math.floor(p.wavelength * .85 / (2 * Math.PI)) });
                    if (c.key === 'markedParticle') return Object.assign({}, c, { max: p.particles });
                    return c;
                });
            },
            bounds: function (item) {
                var s = longitudinalState(item);
                return { left: Math.min(s.p.startX - 44, s.center - 125), right: Math.max(s.right + 44, s.center + 125), top: s.p.showEquilibrium ? -100 : -62, bottom: 106 };
            },
            handles: function (item) {
                var s = longitudinalState(item), p = s.p, h = [{ id: 'length', label: '樣本右界', x: s.right, y: 86, primary: true, readout: '左端固定；圖長 ' + p.length + ' px' }];
                if (s.showWavelength) h.push({ id: 'wavelength', label: '一個波長', x: s.wavelengthStart + p.wavelength, y: 56, readout: 'λ ' + p.wavelength + ' px；拖曳保留 A，減小 A 可縮得更短' });
                var sample = s.amplitudeSample;
                if (Math.abs(sample.coefficient) >= .25) h.push({ id: 'amplitude', label: '粒子位移／振幅', x: sample.x, y: 0, readout: '拖曳水平位移換算 A；A ' + p.amplitude.toFixed(1) + ' px' });
                return h;
            },
            update: function (item, id, point) {
                var s = longitudinalState(item), p = s.p;
                var current = longitudinalParametric.handles(item).find(function (h) { return h.id === id; });
                if (!current) return null;
                if (Math.hypot(point.x - current.x, point.y - current.y) < 1e-8) return { readout: current.readout };
                if (id === 'length') p.length = point.x - p.startX;
                else if (id === 'wavelength' && s.showWavelength) p.wavelength = clamp(point.x - s.wavelengthStart, Math.max(55, Math.ceil(Math.ceil(p.amplitude) * 2 * Math.PI / .85)), Math.min(170, p.length), p.wavelength);
                else if (id === 'amplitude' && Math.abs(s.amplitudeSample.coefficient) >= .25) p.amplitude = (point.x - s.amplitudeSample.base) / s.amplitudeSample.coefficient;
                else return null;
                item.params = library.sanitizeParams('longitudinalWave', p);
                return { readout: 'λ ' + item.params.wavelength + ' px · A ' + item.params.amplitude.toFixed(1) + ' px' };
            }
        }
    );
    add('waves', 'longitudinalWave', '縱波疏密圖', 480, 180, function (ctx, item) {
        var s = longitudinalState(item), p = s.p;
        s.samples.forEach(function (sample, i) {
            var gap = Math.min(i ? sample.x - s.samples[i - 1].x : Infinity, i < s.samples.length - 1 ? s.samples[i + 1].x - sample.x : Infinity);
            // Marker width adapts to density; these are representative positions, not particle radii.
            ctx.save(); ctx.fillStyle = ctx.strokeStyle; begin(ctx); ctx.ellipse(sample.x, 0, Math.min(3.2, gap * .32), 3.2, 0, 0, 2 * Math.PI); ctx.fill(); ctx.restore();
            if (p.showEquilibrium) {
                var half = Math.min(2, p.length / (p.particles - 1) * .3);
                ctx.save(); ctx.lineWidth = Math.min(ctx.lineWidth, p.length / (p.particles - 1) * .25);
                stroke(ctx, [[sample.base - half, -60], [sample.base + half, -56]]);
                stroke(ctx, [[sample.base - half, -56], [sample.base + half, -60]]);
                ctx.restore();
            }
        });
        if (p.showEquilibrium) text(ctx, '平衡位置（上排十字）', s.center, -82, 12);
        if (s.marked) {
            circle(ctx, s.marked.x, 0, 5, false); text(ctx, 'P', s.marked.x, -13, 12);
            if (p.showEquilibrium) { circle(ctx, s.marked.base, -58, 5, false); text(ctx, 'P', s.marked.base, -70, 11); }
            if (p.solutionMode && p.showDisplacement) {
                dashed(ctx, [[s.marked.base, 6], [s.marked.base, 26]]);
                var displacement = s.marked.x - s.marked.base;
                if (Math.abs(displacement) > 1e-7) arrow(ctx, s.marked.base, 26, s.marked.x, 26, Math.min(5, Math.abs(displacement) / 2));
                text(ctx, Math.abs(displacement) > 1e-7 ? '位移 ξ' : '位移 ξ = 0', (s.marked.base + s.marked.x) / 2, 39, 11);
            }
        }
        if (p.solutionMode && p.showRegions) {
            if (p.amplitude === 0) text(ctx, '無疏密差異', s.center, -30, 12);
            else for (var n = -1; n <= Math.ceil(p.length / p.wavelength) * 2 + 2; n++) {
                var offset = (n * Math.PI - p.phase * DEG) * p.wavelength / (2 * Math.PI);
                if (offset >= -1e-7 && offset <= p.length + 1e-7) text(ctx, n % 2 === 0 ? '疏' : '密', p.startX + offset, -30, 12);
            }
        }
        if (p.direction) {
            var directionY = p.showEquilibrium ? -96 : -51;
            arrow(ctx, s.right - 35 * (p.direction > 0 ? 1 : 0), directionY, s.right - 35 * (p.direction < 0 ? 1 : 0), directionY, 5);
            text(ctx, '波傳播', s.right - 42, directionY, 11, 'right');
        }
        if (s.showWavelength) { arrow(ctx, s.wavelengthStart, 56, s.wavelengthStart + p.wavelength, 56, 5, true); text(ctx, 'λ', s.wavelengthStart + p.wavelength / 2, 69, 12); }
        stroke(ctx, [[p.startX, 81], [p.startX, 86], [s.right, 86], [s.right, 81]]);
        text(ctx, '平衡位置樣本範圍', s.center, 99, 11);
    }, { keywords: ['縱波', '疏密波', '聲波', '平衡位置', '粒子位移'], suppressCommonLabel: true, parametric: longitudinalParametric,
        modelNote: '單一時刻的代表粒子位置 x = X + A sin(2π(X−左端)/λ + φ)，X 為平衡位置。上排十字可對照相同編號的粒子；P 的箭頭是位移，不是速度或波的傳播方向。疏密由相鄰粒子間距判斷，不是位移波峰就是密部。方向箭頭是老師指定條件，不能由快照自行推得。限制 2πA/λ < 0.85 避免粒子交叉，縮短 λ 時振幅上限同步降低；仍是誇大的幾何示意，不計算聲壓。圖點寬度隨間距調整，非真粒徑。題目模式保留粒子題圖與指定平衡列／P，隱藏疏密、位移箭頭及 λ 答案。短片段容許不足一個 λ，波長仍可用數值編輯。'
    });

    var LEGACY_PULSE_FWHM = 2 * Math.sqrt(Math.log(2) / 3.2);
    function pulseState(item) {
        var p = params('pulseSuperposition', item), a = p.amplitude, b = p.rightAmplitude;
        // Fixed baselines are essential: moving a wave crest must not move its own origin.
        var rows = [{ id: 'left', name: '甲', x: p.leftX, y: -270, amplitude: a, width: p.leftWidth, sign: p.leftPolarity, direction: p.leftDirection },
            { id: 'right', name: '乙', x: p.rightX, y: -50, amplitude: b, width: p.rightWidth, sign: p.leftPolarity * p.relation, direction: p.rightDirection }];
        var reach = p.shape === 0 ? 3 : 1;
        var left = Math.min(-190, p.leftX - reach * p.leftWidth - 12, p.rightX - reach * p.rightWidth - 12);
        var right = Math.max(190, p.leftX + reach * p.leftWidth + 12, p.rightX + reach * p.rightWidth + 12);
        return { p: p, rows: rows, left: left, right: right, sumY: 240, total: a + b };
    }
    function pulseValue(row, shape, x) {
        var u = (x - row.x) / row.width;
        return row.sign * row.amplitude * (shape === 0 ? Math.exp(-4 * Math.log(2) * u * u) : Math.max(0, 1 - Math.abs(u)));
    }
    var pulseParametric = smart(
        { separation: 80, amplitude: 45, width: null, relation: -1, rightAmplitude: null, leftWidth: null, rightWidth: null,
            leftX: null, rightX: null, leftPolarity: 1, leftDirection: 1, rightDirection: -1, shape: 0, solutionMode: 1 },
        [control('leftX', '甲脈衝中心位置', -150, 150, .1, 'px'), control('rightX', '乙脈衝中心位置', -150, 150, .1, 'px'),
            control('amplitude', '甲脈衝振幅大小', 0, 75, .1, 'px'), control('rightAmplitude', '乙脈衝振幅大小', 0, 75, .1, 'px'),
            control('leftWidth', '甲脈衝半高全寬', 20, 140, .1, 'px'), control('rightWidth', '乙脈衝半高全寬', 20, 140, .1, 'px'),
            choice('leftPolarity', '甲脈衝位移側', [{ value: 1, label: '向上' }, { value: -1, label: '向下' }]),
            choice('relation', '乙相對於甲的位移側', [{ value: 1, label: '同側' }, { value: -1, label: '異側' }]),
            choice('shape', '兩脈衝形狀', [{ value: 0, label: '平滑高斯形' }, { value: 1, label: '三角形（底寬為半高全寬兩倍）' }]),
            choice('leftDirection', '甲的指定傳播方向', [{ value: 0, label: '不標示' }, { value: 1, label: '向右' }, { value: -1, label: '向左' }]),
            choice('rightDirection', '乙的指定傳播方向', [{ value: 0, label: '不標示' }, { value: 1, label: '向右' }, { value: -1, label: '向左' }]), solutionControl()],
        {
            sanitize: function (source) {
                var src = source || {}, p = {}, oldSeparation = clamp(src.separation, 0, 150, 80), oldWidth = clamp(src.width, 25, 95, 48);
                pulseParametric.controls.forEach(function (c) {
                    var v = src[c.key];
                    if (v == null) {
                        if (c.key === 'rightAmplitude') v = src.amplitude;
                        else if (c.key === 'leftWidth' || c.key === 'rightWidth') v = src.width == null ? 50 : oldWidth * LEGACY_PULSE_FWHM;
                        else if (c.key === 'leftX') v = -oldSeparation / 2;
                        else if (c.key === 'rightX') v = oldSeparation / 2;
                    }
                    p[c.key] = clamp(v, c.min, c.max, pulseParametric.defaults[c.key]);
                    if (c.choices) p[c.key] = c.choices.reduce(function (nearest, option) { return Math.abs(option.value - p[c.key]) < Math.abs(nearest - p[c.key]) ? option.value : nearest; }, c.choices[0].value);
                });
                return p;
            },
            bounds: function (item) { var s = pulseState(item); return { left: s.left - 12, top: s.rows[0].y - s.p.amplitude - 42, right: s.right + 12, bottom: s.sumY + s.total + 22 }; },
            handles: function (item) {
                var s = pulseState(item), handles = [];
                s.rows.forEach(function (r) {
                    handles.push({ id: r.id, label: r.name + '振幅', x: r.x, y: r.y - r.sign * r.amplitude, primary: r.id === 'left', readout: r.name + ' A ' + r.amplitude.toFixed(1) + ' px；僅改此脈衝' });
                    handles.push({ id: r.id + '-position', label: r.name + '位置', x: r.x, y: r.y + r.amplitude + 22, readout: r.name + ' x ' + r.x.toFixed(1) + ' px' });
                    if (r.amplitude > 0 && Math.hypot(r.width / 2, r.amplitude / 2) >= 16) handles.push({ id: r.id + '-width', label: r.name + '半高寬', x: r.x + r.width / 2, y: r.y - r.sign * r.amplitude / 2, readout: '半高全寬 ' + r.width.toFixed(1) + ' px' });
                });
                return handles;
            },
            update: function (item, id, point) {
                var s = pulseState(item), p = s.p, row = s.rows.find(function (r) { return id === r.id || id.indexOf(r.id + '-') === 0; });
                var current = pulseParametric.handles(item).find(function (h) { return h.id === id; });
                if (!row || !current) return null;
                if (Math.hypot(point.x - current.x, point.y - current.y) < 1e-8) return { readout: current.readout };
                if (id === row.id) p[row.id === 'left' ? 'amplitude' : 'rightAmplitude'] = (row.y - point.y) / row.sign;
                else if (id === row.id + '-position') p[row.id + 'X'] = point.x;
                else if (id === row.id + '-width') p[row.id + 'Width'] = 2 * (point.x - row.x);
                item.params = library.sanitizeParams('pulseSuperposition', p);
                return { readout: row.name + '脈衝已調整；另一脈衝條件不變' };
            }
        }
    );
    add('waves', 'pulseSuperposition', '脈衝疊加', 400, 520, function (ctx, item) {
        var s = pulseState(item), p = s.p, xs = [], count = Math.ceil(s.right - s.left);
        for (var i = 0; i <= count; i++) xs.push(s.left + (s.right - s.left) * i / count);
        s.rows.forEach(function (r) { [-1, -.5, 0, .5, 1].forEach(function (f) { xs.push(r.x + f * r.width); }); });
        xs.sort(function (a, b) { return a - b; });
        function curve(y, valueAt, dashedLine) {
            ctx.save(); if (dashedLine) ctx.setLineDash([6, 5]); begin(ctx);
            xs.forEach(function (x, i) { if (i) ctx.lineTo(x, y - valueAt(x)); else ctx.moveTo(x, y - valueAt(x)); });
            ctx.stroke(); ctx.restore();
        }
        s.rows.forEach(function (r) {
            stroke(ctx, [[s.left, r.y], [s.right, r.y]]);
            curve(r.y, function (x) { return pulseValue(r, p.shape, x); }, true);
            text(ctx, r.name + '脈衝（分量）', s.left, r.y - r.amplitude - 25, 13, 'left');
            if (r.direction) arrow(ctx, s.right - (r.direction > 0 ? 45 : 0), r.y - r.amplitude - 25, s.right - (r.direction < 0 ? 45 : 0), r.y - r.amplitude - 25, 6);
            stroke(ctx, [[r.x, r.y + r.amplitude + 14], [r.x, r.y + r.amplitude + 28]]);
        });
        stroke(ctx, [[s.left, s.sumY], [s.right, s.sumY]]);
        if (p.solutionMode) curve(s.sumY, function (x) { return pulseValue(s.rows[0], p.shape, x) + pulseValue(s.rows[1], p.shape, x); }, false);
        text(ctx, p.solutionMode ? '同一時刻：合成位移 = 甲 + 乙' : '同一時刻：請畫合成波', s.left, s.sumY - s.total - 25, 13, 'left');
    }, { keywords: ['脈衝', '疊加原理', '干涉', '不等振幅', '三角脈衝'], suppressCommonLabel: true, parametric: pulseParametric,
        modelNote: '三排採相同水平座標與位移比例，表示同一時刻的甲、乙分量及逐點代數和，不是三個先後時刻。兩分量可獨立設定位置、振幅與半高全寬；拖波峰只改該分量振幅，底部短刻線改位置，半高處改寬。拖過基準線會停在零，位移側用選單明確切換；上下與傳播左右互不混用。異側不保證完全相消，只有位置、形狀、寬度及振幅都配對時才全抵消。高斯尾端在圖外微小截斷；三角形底寬為半高全寬兩倍。題目模式只隱藏合成曲線。這是線性疊加快照，不計算時間、速度、能量或非線性波。全部尺寸為排圖 px。'
    });

    var dopplerParametric = smart(
        { speed: 32, wavelength: 34, fronts: 7, direction: 1, showMotion: 1, showFronts: 1, showOrigins: 0, showValues: 0 },
        [control('speed', '波源每週期位移量', 0, 85, 1, 'px'), choice('direction', '波源移動方向', [{ value: 1, label: '向右' }, { value: -1, label: '向左' }]), control('wavelength', '靜止波長（波每週期前進距離）', 22, 55, 1, 'px'), control('fronts', '歷史波前數量', 4, 10, 1, '圈'), choice('showMotion', '波源運動提示', [{ value: 0, label: '隱藏（由波面判斷）' }, { value: 1, label: '顯示' }]), choice('showFronts', '波前', [{ value: 0, label: '隱藏（讓學生作圖）' }, { value: 1, label: '顯示' }]), choice('showOrigins', '歷次發射位置', [{ value: 0, label: '隱藏' }, { value: 1, label: '顯示' }]), choice('showValues', '速率比與狀態解答', [{ value: 0, label: '隱藏' }, { value: 1, label: '顯示' }])],
        {
            bounds: function (item) { var p = params('dopplerWavefront', item), r = p.showFronts ? p.wavelength * p.fronts : 0, c = p.showFronts || p.showOrigins ? -p.direction * p.speed * p.fronts : 0; return { left: Math.min(-70, c - r, p.direction * p.speed - 12) - 12, right: Math.max(70, c + r, p.direction * p.speed + 12) + 12, top: -Math.max(54, r + 12), bottom: Math.max(20, r + 12) + (p.showValues ? 44 : 0) }; },
            handles: function (item) { var p = params('dopplerWavefront', item), h = []; if (p.showMotion) h.push({ id: 'source-motion', label: '每週期位移量', x: p.direction * p.speed, y: -16, primary: true, readout: p.speed + ' px／週期' }); if (p.showFronts) h.push({ id: 'wavelength', label: '靜止波長', x: -p.direction * p.speed, y: -p.wavelength, readout: 'λ ' + p.wavelength + ' px' }); return h; },
            update: function (item, id, point) { var p = params('dopplerWavefront', item); if (id === 'source-motion') p.speed = Math.max(0, point.x * p.direction); else if (id === 'wavelength') p.wavelength = Math.max(22, -point.y); else return null; item.params = library.sanitizeParams('dopplerWavefront', p); return { readout: id === 'source-motion' ? '每週期位移 ' + item.params.speed + ' px' : 'λ ' + item.params.wavelength + ' px' }; }
        }
    );
    add('waves', 'dopplerWavefront', '都卜勒波面', 390, 260, function (ctx, item) {
        var p = params('dopplerWavefront', item);
        for (var i = p.fronts; i >= 1; i -= 1) { if (p.showFronts) circle(ctx, -p.direction * p.speed * i, 0, p.wavelength * i, false); if (p.showOrigins) dot(ctx, -p.direction * p.speed * i, 0, 2.5); }
        circle(ctx, 0, 0, 9, true);
        if (p.showMotion) {
            if (p.speed > 0) { arrow(ctx, 0, -16, p.direction * p.speed, -16, Math.min(7, p.speed / 2)); text(ctx, '波源運動', p.direction * p.speed / 2, -38, 12); }
            else text(ctx, '靜止波源', 0, -31, 12);
        }
        if (p.showValues) {
            var y = Math.max(20, p.showFronts ? p.wavelength * p.fronts + 12 : 20);
            text(ctx, '|v|/c = ' + (p.speed / p.wavelength).toFixed(2), 0, y + 15, 12);
            text(ctx, p.speed === 0 ? '靜止' : p.speed < p.wavelength ? '次波速' : p.speed === p.wavelength ? '等波速' : '超波速波前（非普通頻移公式）', 0, y + 32, 12);
        }
    }, { keywords: ['都卜勒效應', '移動波源', '波面'], modelNote: '均勻靜止介質中、等週期發射的波前快照；每圈保留自己的發射中心，半徑為經過週期數乘靜止波長。波源每週期位移量除以 λ 才是速率比 |v|/c，px 不是 m/s。增加圈數只增加較早的波前，不改既有間距。方向明確切換，拖過零不偷改方向；可隱藏運動提示或波前出題。等／超波速只示意波面聚集與包絡，不套用次波速的接收頻率公式，不模擬衝擊波強度、觀察者運動或相對論光都卜勒效應。', suppressCommonLabel: true, parametric: dopplerParametric });

    function resonanceTubeState(item) {
        var p = params('resonanceTube', item); var top = -p.tubeHeight / 2;
        var fixed = p.experimentMode === 1;
        var airPixels = fixed ? p.tubeHeight * p.airLength / p.tubeLength : p.airColumn;
        var wavelength = fixed ? 100 * p.soundSpeed / p.frequency : 4 * p.airColumn / (2 * p.harmonic - 1);
        var harmonic = fixed ? Math.max(1, Math.round((4 * p.airLength / wavelength + 1) / 2)) : p.harmonic;
        var resonantLength = (2 * harmonic - 1) * wavelength / 4;
        // Half the 0.1 cm input step, not a model of physical resonance bandwidth.
        var resonant = !fixed || Math.abs(p.airLength - resonantLength) <= 0.050000001;
        return { p: p, top: top, bottom: p.tubeHeight / 2, airPixels: airPixels, waterY: top + airPixels,
            fixed: fixed, wavelength: wavelength, harmonic: harmonic, resonantLength: resonantLength,
            resonant: resonant, drawWave: Boolean(p.solutionMode && resonant && harmonic <= 8) };
    }
    var resonanceTubeParametric = smart(
        { tubeHeight: 210, airColumn: null, waterLevel: null, harmonic: 1, experimentMode: 0, solutionMode: 1,
            tubeLength: 100, airLength: 60, frequency: 425, soundSpeed: 340 },
        [
            choice('experimentMode', '用途', [{ value: 0, label: '指定共鳴振型（幾何示意）' }, { value: 1, label: '固定音叉頻率（數值題）' }]),
            control('tubeHeight', '管子的繪圖高度', 130, 310, 1, 'px'),
            control('airColumn', '空氣柱圖長 L', 35, 295, 1, 'px'),
            control('harmonic', '第幾次共鳴（1、3、5…倍頻）', 1, 4, 1, '次'),
            control('tubeLength', '實際管長', 30, 200, 1, 'cm'),
            control('airLength', '空氣柱長 L', 5, 195, 0.1, 'cm'),
            control('frequency', '音叉頻率 f', 100, 2000, 1, 'Hz'),
            control('soundSpeed', '聲速 c', 300, 360, 1, 'm/s'), solutionControl()
        ],
        {
            sanitize: function (source) {
                var incoming = source && typeof source === 'object' ? source : {};
                var tubeHeight = Math.round(clamp(incoming.tubeHeight, 130, 310, 210));
                var migratedAirColumn = incoming.airColumn != null && Number.isFinite(Number(incoming.airColumn))
                    ? Number(incoming.airColumn)
                    : (incoming.waterLevel != null ? tubeHeight - clamp(incoming.waterLevel, 20, 165, 70) : 140);
                return {
                    tubeHeight: tubeHeight,
                    airColumn: Math.round(clamp(migratedAirColumn, 35, tubeHeight - 15, 140)),
                    waterLevel: null,
                    harmonic: Math.round(clamp(incoming.harmonic, 1, 4, 1)),
                    experimentMode: Math.round(clamp(incoming.experimentMode, 0, 1, 0)),
                    solutionMode: Math.round(clamp(incoming.solutionMode, 0, 1, 1)),
                    tubeLength: Math.round(clamp(incoming.tubeLength, 30, 200, 100)),
                    airLength: Math.round(clamp(incoming.airLength, 5, Math.round(clamp(incoming.tubeLength, 30, 200, 100)) - 5, 60) * 10) / 10,
                    frequency: Math.round(clamp(incoming.frequency, 100, 2000, 425)),
                    soundSpeed: Math.round(clamp(incoming.soundSpeed, 300, 360, 340))
                };
            },
            getControls: function (item) {
                var p = params('resonanceTube', item);
                return resonanceTubeParametric.controls.filter(function (c) {
                    if (['tubeLength', 'airLength', 'frequency', 'soundSpeed'].indexOf(c.key) >= 0) return p.experimentMode === 1;
                    if (c.key === 'airColumn') return p.experimentMode === 0;
                    if (c.key === 'harmonic') return p.experimentMode === 0 && p.solutionMode === 1;
                    return true;
                }).map(function (c) {
                    if (c.key === 'airColumn') return Object.assign({}, c, { max: p.tubeHeight - 15 });
                    if (c.key === 'airLength') return Object.assign({}, c, { max: p.tubeLength - 5 });
                    return c;
                });
            },
            bounds: function (item) {
                var p = params('resonanceTube', item);
                return { left: -105, top: -p.tubeHeight / 2 - 88, right: 172, bottom: p.tubeHeight / 2 + 96 };
            },
            handles: function (item) {
                var s = resonanceTubeState(item);
                return [{ id: 'water', label: '水面／氣柱長', x: 42, y: s.waterY, primary: true,
                    readout: 'L ' + (s.fixed ? s.p.airLength + ' cm' : s.p.airColumn + ' px') }];
            },
            update: function (item, id, point) {
                if (id !== 'water') return null;
                var p = params('resonanceTube', item);
                if (p.experimentMode === 1) p.airLength = (point.y + p.tubeHeight / 2) * p.tubeLength / p.tubeHeight;
                else p.airColumn = clamp(point.y + p.tubeHeight / 2, 35, p.tubeHeight - 15, p.airColumn);
                item.params = library.sanitizeParams('resonanceTube', p);
                return { readout: 'L ' + (p.experimentMode === 1 ? item.params.airLength + ' cm' : item.params.airColumn + ' px') };
            }
        }
    );
    add('waves', 'resonanceTube', '共鳴管實驗', 210, 350, function (ctx, item) {
        var s = resonanceTubeState(item); var p = s.p; var top = s.top; var bottom = s.bottom;
        stroke(ctx, [[-42, top], [-42, bottom], [42, bottom], [42, top]]);
        var waterY = s.waterY;
        ctx.save(); ctx.globalAlpha = 0.14; ctx.fillStyle = ctx.strokeStyle; ctx.fillRect(-41, waterY, 82, bottom - waterY); ctx.restore(); stroke(ctx, [[-42, waterY], [42, waterY]]);
        function drawTubeExtreme(sign) {
            begin(ctx);
            var samples = Math.max(120, s.harmonic * 48);
            for (var index = 0; index <= samples; index += 1) {
                var fraction = index / samples;
                var y = waterY - s.airPixels * fraction;
                var x = sign * 28 * Math.sin((2 * s.harmonic - 1) * Math.PI * fraction / 2);
                if (!index) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
        if (s.drawWave) {
            drawTubeExtreme(1);
            ctx.save(); ctx.setLineDash([6, 5]); drawTubeExtreme(-1); ctx.restore();
            dot(ctx, 0, waterY, 3);
        }
        // Boundary labels stay separated even for a very short air column.
        text(ctx, s.drawWave ? '開口（位移腹）' : '開口', 54, top - 10, 12, 'left');
        text(ctx, s.drawWave ? '水面（位移節）' : '水面', 54, Math.max(waterY, top + 16), 12, 'left');
        if (waterY < top + 16) stroke(ctx, [[42, waterY], [51, top + 16]]);
        // A recognizable U-shaped fork, not an isolated diagonal stroke.
        stroke(ctx, [[-16, top - 60], [-16, top - 38], [-10, top - 32], [10, top - 32], [16, top - 38], [16, top - 60]]);
        stroke(ctx, [[0, top - 32], [0, top - 20]]);
        text(ctx, '音叉', -46, top - 48, 12);
        text(ctx, s.fixed ? 'f = ' + p.frequency + ' Hz' : '共鳴振型示意', 0, top - 77, 13);
        if (s.fixed) {
            text(ctx, 'L = ' + p.airLength.toFixed(1) + ' cm', 0, bottom + 20, 13);
            text(ctx, 'c = ' + p.soundSpeed + ' m/s', 0, bottom + 40, 12);
            if (p.solutionMode) {
                text(ctx, s.resonant ? '第 ' + s.harmonic + ' 次共鳴（精度內）' : '未達理想共鳴長度', 0, bottom + 61, 12);
                text(ctx, s.resonant && !s.drawWave ? '高階振型過密，省略曲線' : '最近共鳴長 ' + s.resonantLength.toFixed(2) + ' cm', 0, bottom + 81, 12);
            }
        } else {
            text(ctx, 'L = ' + p.airColumn + ' px（圖長）', 0, bottom + 22, 13);
            if (p.solutionMode) text(ctx, 'λ = ' + Math.round(s.wavelength) + ' px（圖長）', 0, bottom + 44, 13);
        }
    }, { keywords: ['共鳴管', '氣柱共鳴', '音叉'], modelNote: '水面視為閉端、管口為開端，忽略端修正。共鳴振型模式依所選階次畫位移的兩個極端形狀（實線與虛線），圖長 px 不代表公尺。固定音叉模式使用 cm、Hz 與 m/s：λ=c/f，理想共鳴長為 (2n−1)λ/4；拖水面不改頻率，調繪圖高度不改實際長度。距離理想共鳴長在 0.05 cm 內（半個輸入步長）才顯示振型，此顯示精度不是實驗共鳴頻寬；未符合時不畫駐波，不表示空氣完全不振動。超過第 8 次共鳴只顯示判定，避免曲線過密；未模擬音量、阻尼或端修正。題目模式隱藏振型、節腹與判定，JSON 保留設定。', suppressCommonLabel: true, parametric: resonanceTubeParametric });

    function intensityParametric(type, doubleSlit) {
        var defaults = doubleSlit
            ? { width: 270, height: 150, fringeSpacing: 30, envelopeHalfWidth: 86, intensity: 1 }
            : { width: 270, height: 150, centralWidth: 104, intensity: 1 };
        var controls = [control('width', '圖寬', 160, 430, 1, 'px'), control('height', '圖高', 100, 260, 1, 'px')];
        if (doubleSlit) {
            controls.push(control('fringeSpacing', '干涉條紋間距 Δx', 12, 65, 1, 'px'));
            controls.push(control('envelopeHalfWidth', '包絡第一暗紋位置', 45, 170, 1, 'px'));
        } else controls.push(control('centralWidth', '中央亮紋全寬', 40, 180, 1, 'px'));
        controls.push(control('intensity', '相對峰值', 0.3, 1.2, 0.1, ''));
        return smart(defaults, controls, {
            sanitize: function (source) {
                var incoming = source && typeof source === 'object' ? source : {};
                var legacySpacing = clamp(incoming.spacing, 20, 90, doubleSlit ? 38 : 52);
                var output = {
                    width: Math.round(clamp(incoming.width, 160, 430, 270)),
                    height: Math.round(clamp(incoming.height, 100, 260, 150)),
                    intensity: Math.round(clamp(incoming.intensity, 0.3, 1.2, clamp(incoming.envelope, 0.3, 1.2, 1)) * 10) / 10
                };
                if (doubleSlit) {
                    output.fringeSpacing = Math.round(clamp(incoming.fringeSpacing, 12, 65, legacySpacing / 1.55));
                    output.envelopeHalfWidth = Math.round(clamp(incoming.envelopeHalfWidth, Math.max(45, output.fringeSpacing + 1), 170, legacySpacing));
                } else output.centralWidth = Math.round(clamp(incoming.centralWidth, 40, 180, legacySpacing * 2));
                output.width = Math.max(output.width, (doubleSlit ? 2 * output.envelopeHalfWidth : output.centralWidth) + 64);
                return output;
            },
            bounds: function (item) { var p = params(type, item); return { left: -p.width / 2 - 8, top: -p.height / 2 - 8, right: p.width / 2 + 8, bottom: p.height / 2 + 8 }; },
            handles: function (item) {
                var p = params(type, item); var a = axesGeometry(p.width, p.height); var center = (a.left + a.right) / 2;
                var controls = doubleSlit
                    ? [{ id: 'fringe', label: '干涉週期（基線量測）', x: center + p.fringeSpacing, y: a.bottom, primary: true, readout: 'Δx ' + p.fringeSpacing }, { id: 'envelope', label: '包絡第一暗紋', x: center + p.envelopeHalfWidth, y: a.bottom, readout: 'x₁ ' + p.envelopeHalfWidth }]
                    : [{ id: 'central', label: '第一暗紋', x: center + p.centralWidth / 2, y: a.bottom, primary: true, readout: '中央亮紋全寬 ' + p.centralWidth }];
                return controls;
            },
            update: function (item, id, point) {
                var p = params(type, item);
                var a = axesGeometry(p.width, p.height); var center = (a.left + a.right) / 2;
                if (id === 'fringe') p.fringeSpacing = Math.abs(point.x - center);
                else if (id === 'envelope') p.envelopeHalfWidth = Math.abs(point.x - center);
                else if (id === 'central') p.centralWidth = Math.abs(point.x - center) * 2;
                else return null;
                item.params = library.sanitizeParams(type, p);
                return { readout: id === 'central' ? '全寬 ' + item.params.centralWidth : (id === 'fringe' ? 'Δx ' + item.params.fringeSpacing : 'x₁ ' + item.params.envelopeHalfWidth) };
            }
        });
    }
    function drawIntensity(ctx, item, type, doubleSlit) {
        var p = params(type, item); var a = axes(ctx, p.width, p.height, 'x', 'I'); var center = (a.left + a.right) / 2; var half = (a.right - a.left) / 2;
        stroke(ctx, [[center, a.bottom - 3], [center, a.bottom + 3]]);
        text(ctx, '0', center, a.bottom + 13, 12);
        begin(ctx);
        for (var i = 0; i <= 220; i += 1) {
            var x = a.left + (a.right - a.left) * i / 220;
            var offset = x - center;
            var halfWidth = doubleSlit ? p.envelopeHalfWidth : p.centralWidth / 2;
            var u = offset / halfWidth * Math.PI;
            var sinc = Math.abs(u) < 0.001 ? 1 : Math.sin(u) / u;
            var intensity = sinc * sinc * p.intensity;
            if (doubleSlit) intensity *= Math.pow(Math.cos(offset / p.fringeSpacing * Math.PI), 2);
            var y = a.bottom - intensity * (a.bottom - a.top) * 0.74;
            if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }
    add('waves', 'singleSlitIntensity', '單縫繞射光強圖', 290, 170, function (ctx, item) { drawIntensity(ctx, item, 'singleSlitIntensity', false); }, { keywords: ['單縫繞射', '光強分布', '中央亮紋'], suppressCommonLabel: true, parametric: intensityParametric('singleSlitIntensity', false) });
    add('waves', 'doubleSlitIntensity', '雙縫干涉光強圖', 290, 170, function (ctx, item) { drawIntensity(ctx, item, 'doubleSlitIntensity', true); }, { keywords: ['雙縫干涉', '光強分布', '干涉條紋'], suppressCommonLabel: true, parametric: intensityParametric('doubleSlitIntensity', true) });

    var doubleSlitExperimentParametric = smart(
        { width: 520, height: 260, wavelength: 30, separation: 72, aperture: 16, leftX: null, barrierX: null, showIntensity: 0, showWavefronts: 1, solutionMode: 1 },
        [
            control('width', '裝置長度', 340, 760, 1, 'px'),
            control('height', '裝置高度', 180, 420, 1, 'px'),
            control('wavelength', '波長 λ', 14, 62, 1, 'px'),
            control('separation', '雙縫中心距 d', 30, 150, 1, 'px'),
            control('aperture', '縫寬 a', 6, 42, 1, 'px'),
            choice('showIntensity', '遠場角分布', [{ value: 0, label: '不加光強圖' }, { value: 1, label: '加上遠場光強圖（θ 座標）' }]),
            choice('showWavefronts', '出射波前示意', [{ value: 0, label: '隱藏（保留裝置，避免線條過密）' }, { value: 1, label: '顯示同相點源波前' }]),
            solutionControl()
        ],
        {
            sanitize: function (source) {
                var incoming = source && typeof source === 'object' ? source : {};
                var aperture = Math.round(clamp(incoming.aperture, 6, 42, 16));
                var separation = Math.round(clamp(incoming.separation, Math.max(30, aperture + 16), 150, 72));
                var width = Math.round(clamp(incoming.width, 340, 760, 520));
                var leftX = incoming.leftX == null ? -width / 2 : clamp(incoming.leftX, -380, -170, -260);
                var barrierX = incoming.barrierX == null ? -width * 0.18 : clamp(incoming.barrierX, leftX + 108, leftX + 244, leftX + 166.4);
                return {
                    width: width, leftX: leftX, barrierX: barrierX,
                    height: Math.round(clamp(incoming.height, Math.max(180, separation + aperture * 2 + 54), 420, 260)),
                    wavelength: Math.round(clamp(incoming.wavelength, 14, 62, 30)),
                    separation: separation,
                    aperture: aperture,
                    showIntensity: Math.round(clamp(incoming.showIntensity, 0, 1, 0)),
                    showWavefronts: Math.round(clamp(incoming.showWavefronts, 0, 1, 1)),
                    solutionMode: Math.round(clamp(incoming.solutionMode, 0, 1, 1))
                };
            },
            getControls: function (item) {
                var p = params('doubleSlitExperiment', item);
                return doubleSlitExperimentParametric.controls.filter(function (c) { return p.solutionMode || c.key !== 'showWavefronts'; }).map(function (c) {
                    if (c.key === 'height') return Object.assign({}, c, { min: Math.max(180, p.separation + p.aperture * 2 + 54) });
                    if (c.key === 'separation') return Object.assign({}, c, { min: Math.max(30, p.aperture + 16) });
                    if (c.key === 'aperture') return Object.assign({}, c, { max: Math.min(42, p.separation - 16) });
                    return c;
                });
            },
            bounds: function (item) {
                var p = params('doubleSlitExperiment', item);
                return { left: p.leftX - 20, top: -p.height / 2 - 34, right: p.leftX + p.width + 32, bottom: p.height / 2 + (p.showIntensity ? 214 : 28) };
            },
            handles: function (item) {
                var p = params('doubleSlitExperiment', item); var barrierX = p.barrierX;
                return [
                    { id: 'extent', label: '屏角／圖尺寸', x: p.leftX + p.width - 5, y: p.height / 2, primary: true, readout: p.width + ' × ' + p.height + ' px' },
                    { id: 'separation', label: '雙縫間距', x: barrierX, y: p.separation / 2, readout: 'd ' + p.separation + ' px' },
                    { id: 'aperture', label: '縫寬', x: barrierX, y: -p.separation / 2 - p.aperture / 2, readout: 'a ' + p.aperture + ' px' },
                    { id: 'wavelength', label: '波長', x: p.leftX + 24 + p.wavelength, y: 0, readout: 'λ ' + p.wavelength + ' px' }
                ];
            },
            update: function (item, id, point) {
                var p = params('doubleSlitExperiment', item);
                if (id === 'extent') { p.width = point.x - p.leftX + 5; p.height = Math.abs(point.y) * 2; }
                else if (id === 'separation') p.separation = Math.abs(point.y) * 2;
                else if (id === 'aperture') p.aperture = clamp(-2 * (point.y + p.separation / 2), 6, Math.min(42, p.separation - 16), p.aperture);
                else if (id === 'wavelength') p.wavelength = point.x - p.leftX - 24;
                else return null;
                item.params = library.sanitizeParams('doubleSlitExperiment', p);
                return { readout: id === 'wavelength' ? 'λ ' + item.params.wavelength + ' px' : 'a ' + item.params.aperture + ' · d ' + item.params.separation + ' px' };
            }
        }
    );
    add('waves', 'doubleSlitExperiment', '雙狹縫干涉實驗（智慧）', 580, 310, function (ctx, item) {
        var p = params('doubleSlitExperiment', item); var left = p.leftX; var right = left + p.width; var top = -p.height / 2; var bottom = p.height / 2; var barrierX = p.barrierX; var screenX = right - 5;
        text(ctx, p.solutionMode ? (p.showWavefronts ? '同相點源波前示意（非光強）' : '雙狹縫裝置（示意）') : '雙狹縫裝置（題目）', (left + right) / 2, top - 20, 13);
        for (var waveX = left + 24; waveX < barrierX - 15; waveX += p.wavelength) stroke(ctx, [[waveX, top + 18], [waveX, bottom - 18]]);
        arrow(ctx, left + 12, 0, barrierX - 24, 0, 7); text(ctx, 'λ', left + 30 + p.wavelength / 2, -14, 13);
        var upperCenter = -p.separation / 2; var lowerCenter = p.separation / 2;
        ctx.lineWidth *= 2.4;
        stroke(ctx, [[barrierX, top], [barrierX, upperCenter - p.aperture / 2]]);
        stroke(ctx, [[barrierX, upperCenter + p.aperture / 2], [barrierX, lowerCenter - p.aperture / 2]]);
        stroke(ctx, [[barrierX, lowerCenter + p.aperture / 2], [barrierX, bottom]]);
        ctx.lineWidth /= 2.4;
        if (p.solutionMode && p.showWavefronts) {
            ctx.save(); begin(ctx); ctx.rect(barrierX, top, screenX - barrierX, p.height); ctx.clip();
            [upperCenter, lowerCenter].forEach(function (sourceY) {
                var maxRadius = Math.hypot(screenX - barrierX, p.height / 2 + p.separation / 2);
                for (var radius = p.wavelength; radius <= maxRadius; radius += p.wavelength) {
                    begin(ctx); ctx.arc(barrierX, sourceY, radius, -Math.PI / 2, Math.PI / 2); ctx.stroke();
                }
            });
            ctx.restore();
            [upperCenter, lowerCenter].forEach(function (sourceY) { dot(ctx, barrierX, sourceY, 2.5); });
        }
        ctx.lineWidth *= 2.4; stroke(ctx, [[screenX, top], [screenX, bottom]]); ctx.lineWidth /= 2.4;
        text(ctx, '雙縫', barrierX, bottom + 18, 13); text(ctx, '觀察屏', screenX, bottom + 18, 13);
        dashed(ctx, [[barrierX - 14, upperCenter], [barrierX + 14, upperCenter]]); dashed(ctx, [[barrierX - 14, lowerCenter], [barrierX + 14, lowerCenter]]);
        text(ctx, 'd', barrierX - 17, 0, 13);
        text(ctx, 'a', barrierX + 17, upperCenter, 13);
        if (p.showIntensity) {
            // An independent Fraunhofer angular plot, not the finite-distance screen above.
            var x0 = left + 34, x1 = right - 24, y0 = bottom + 170, plotHeight = 78;
            text(ctx, '遠場角分布（非屏上位置）', (left + right) / 2, bottom + 51, 13);
            arrow(ctx, x0, y0, x1 + 10, y0, 5); arrow(ctx, x0, y0, x0, y0 - plotHeight - 6, 5);
            text(ctx, 'I/I(0)', x0, y0 - plotHeight - 19, 12);
            text(ctx, '1', x0 - 13, y0 - plotHeight, 11); text(ctx, '0', x0 - 13, y0, 11);
            [-90, 0, 90].forEach(function (angle) { var x = x0 + (angle + 90) / 180 * (x1 - x0); stroke(ctx, [[x, y0], [x, y0 + 4]]); text(ctx, angle + '°', x, y0 + 15, 11); });
            text(ctx, 'θ', x1 + 18, y0, 12);
            if (p.solutionMode) {
                var intensity = [], envelope = [];
                for (var i = 0; i <= 720; i++) {
                    var theta = (-90 + i / 4) * DEG;
                    var beta = Math.PI * p.aperture * Math.sin(theta) / p.wavelength;
                    var sinc = Math.abs(beta) < 1e-10 ? 1 : Math.sin(beta) / beta;
                    var env = sinc * sinc;
                    var value = env * Math.pow(Math.cos(Math.PI * p.separation * Math.sin(theta) / p.wavelength), 2);
                    var plotX = x0 + i / 720 * (x1 - x0);
                    intensity.push([plotX, y0 - plotHeight * value]); envelope.push([plotX, y0 - plotHeight * env]);
                }
                dashed(ctx, envelope); stroke(ctx, intensity);
                text(ctx, '實線：雙縫光強　虛線：單縫包絡', (left + right) / 2, bottom + 203, 12);
            } else text(ctx, '請畫出光強分布', (left + right) / 2, bottom + 203, 12);
        }
    }, { keywords: ['雙狹縫', '雙縫干涉', '楊氏實驗', '波長', '智慧實驗'], modelNote: '上圖是同相、等振幅點源的波前示意；縫寬只標洞口，不把弧線交點當作光強。可開啟下方獨立的遠場角分布：I/I(0) = sinc²(πa sinθ/λ) cos²(πd sinθ/λ)，縫寬、縫距與波長共同決定曲線。這是均勻照明、等寬雙縫的純量 Fraunhofer 模型，不是近場解或上方屏幕位置刻度；px 僅供同尺度比例排圖，非實際光學裝置。屏角拖曳固定入射端與雙縫；圖長不改角分布。至少保留 16 px 縫間隔，放不下時會擴大縫距／圖高。題目模式隱藏出射波前、光強與包絡，保留已知入射波及可選空座標。', suppressCommonLabel: true, parametric: doubleSlitExperimentParametric });

    function prismDispersionRay(p, fraction) {
        // Each air/glass interface uses Snell's law, with angles relative to its normal.
        var normal = Math.atan(1 / 1.72);
        var index = p.redIndex + (p.violetIndex - p.redIndex) * fraction;
        var insideAngle = normal - Math.asin(Math.sin(normal) / index);
        var tangent = Math.tan(insideAngle);
        var entry = { x: -p.prismSize / 4, y: 0 };
        var exitX = p.prismSize / 4 * (1 + tangent / 1.72) / (1 - tangent / 1.72);
        var exit = { x: exitX, y: (exitX - entry.x) * tangent };
        var angle = -normal + Math.asin(Math.min(1, index * Math.sin(insideAngle + normal)));
        return { entry: entry, exit: exit, angle: angle, end: { x: exit.x + Math.cos(angle) * p.rayLength, y: exit.y + Math.sin(angle) * p.rayLength } };
    }
    var prismDispersionParametric = smart(
        { redIndex: 1.42, violetIndex: 1.5, rayLength: 125, prismSize: 92 },
        [control('redIndex', '紅光折射率', 1.3, 1.5, 0.01, ''), control('violetIndex', '紫光折射率', 1.3, 1.52, 0.01, ''), control('rayLength', '出射光長度', 70, 210, 1, 'px'), control('prismSize', '稜鏡大小', 55, 145, 1, 'px')],
        {
            sanitize: function (source) { var p = source || {}; var red = Math.round(clamp(p.redIndex, 1.3, 1.5, 1.42) * 100) / 100; return { redIndex: red, violetIndex: Math.round(clamp(p.violetIndex, red, 1.52, 1.5) * 100) / 100, rayLength: Math.round(clamp(p.rayLength, 70, 210, 125)), prismSize: Math.round(clamp(p.prismSize, 55, 145, 92)) }; },
            bounds: function (item) { var p = params('prismDispersion', item); var red = prismDispersionRay(p, 0); var violet = prismDispersionRay(p, 1); return { left: -200, right: Math.max(red.end.x, violet.end.x) + 28, top: -p.prismSize * 0.43 - 14, bottom: Math.max(p.prismSize * 0.43, violet.end.y) + 20 }; },
            handles: function (item) { var p = params('prismDispersion', item); var ray = prismDispersionRay(p, 1); return [{ id: 'violet', label: '出射光長度', x: ray.end.x, y: ray.end.y, primary: true, readout: 'L ' + p.rayLength + ' px' }]; },
            update: function (item, id, point) { if (id !== 'violet') return null; var p = params('prismDispersion', item); var ray = prismDispersionRay(p, 1); p.rayLength = (point.x - ray.exit.x) * Math.cos(ray.angle) + (point.y - ray.exit.y) * Math.sin(ray.angle); item.params = library.sanitizeParams('prismDispersion', p); return { readout: 'L ' + item.params.rayLength + ' px；角度由折射率決定' }; }
        }
    );
    add('waves', 'prismDispersion', '三稜鏡色散', 420, 260, function (ctx, item) {
        var p = params('prismDispersion', item); var h = p.prismSize * 0.86;
        filledPath(ctx, [[-p.prismSize / 2, h / 2], [0, -h / 2], [p.prismSize / 2, h / 2]]);
        arrow(ctx, -185, 0, -p.prismSize / 4, 0, 8); text(ctx, '白光', -145, -15, 14);
        for (var index = 0; index < 6; index += 1) {
            var ray = prismDispersionRay(p, index / 5);
            stroke(ctx, [[ray.entry.x, ray.entry.y], [ray.exit.x, ray.exit.y]]);
            arrow(ctx, ray.exit.x, ray.exit.y, ray.end.x, ray.end.y, 6);
        }
        // Label the spectrum edges, not all six closely spaced rays.
        var red = prismDispersionRay(p, 0); var violet = prismDispersionRay(p, 1);
        if (p.redIndex === p.violetIndex) text(ctx, 'R–V', red.end.x + 12, red.end.y - 12, 12);
        else {
            text(ctx, 'R', red.end.x + 10, red.end.y - 9, 12);
            text(ctx, 'V', violet.end.x + 10, violet.end.y + 9, 12);
        }
    }, { keywords: ['色散', '三稜鏡', '光譜', '彩虹'], modelNote: '入射與出射依 Snell 定律；折射率決定偏折角，拖曳只改出射線的顯示長度。紅光 R 與紫光 V 標在光譜兩端。', suppressCommonLabel: true, parametric: prismDispersionParametric });

    /* Thermodynamics. */
    var pistonParametric = smart(
        { width: 150, height: 210, pistonY: -28, particles: 20, weights: 2 },
        [control('width', '汽缸寬度', 90, 240, 1, 'px'), control('height', '汽缸高度', 130, 320, 1, 'px'), control('pistonY', '活塞位置', -100, 75, 1, 'px'), control('particles', '氣體粒子數', 4, 42, 1, '個'), control('weights', '上方砝碼數', 0, 5, 1, '個')],
        {
            sanitize: function (source) {
                var incoming = source && typeof source === 'object' ? source : {};
                var height = Math.round(clamp(incoming.height, 130, 320, 210));
                return {
                    width: Math.round(clamp(incoming.width, 90, 240, 150)), height: height,
                    pistonY: Math.round(clamp(incoming.pistonY, -height / 2 + 20, height / 2 - 45, -28)),
                    particles: Math.round(clamp(incoming.particles, 4, 42, 20)), weights: Math.round(clamp(incoming.weights, 0, 5, 2))
                };
            },
            bounds: function (item) { var p = params('pistonCylinder', item); return { left: -p.width / 2 - 15, top: Math.min(-p.height / 2 - 8, p.pistonY - 42 - p.weights * 13), right: p.width / 2 + 15, bottom: p.height / 2 + 32 }; },
            handles: function (item) { var p = params('pistonCylinder', item); return [{ id: 'piston', label: '活塞', x: p.width / 2, y: p.pistonY, primary: true, readout: '活塞 y ' + p.pistonY }]; },
            update: function (item, id, point) { if (id !== 'piston') return null; var p = params('pistonCylinder', item); p.pistonY = clamp(point.y, -p.height / 2 + 20, p.height / 2 - 45, p.pistonY); item.params = library.sanitizeParams('pistonCylinder', p); return { readout: '活塞 y ' + Math.round(item.params.pistonY) }; }
        }
    );
    add('thermal', 'pistonCylinder', '活塞汽缸與氣體', 210, 330, function (ctx, item) {
        var p = params('pistonCylinder', item); var left = -p.width / 2; var right = p.width / 2; var top = -p.height / 2; var bottom = p.height / 2;
        stroke(ctx, [[left, top], [left, bottom], [right, bottom], [right, top]]);
        ctx.fillRect(left - 5, p.pistonY - 8, p.width + 10, 16); ctx.strokeRect(left - 5, p.pistonY - 8, p.width + 10, 16);
        stroke(ctx, [[0, p.pistonY - 8], [0, p.pistonY - 30]]);
        for (var w = 0; w < p.weights; w += 1) { ctx.fillRect(-30, p.pistonY - 42 - w * 13, 60, 12); ctx.strokeRect(-30, p.pistonY - 42 - w * 13, 60, 12); }
        var gasTop = p.pistonY + 17; var gasHeight = Math.max(25, bottom - gasTop - 8);
        for (var i = 0; i < p.particles; i += 1) { var column = i % 7; var row = Math.floor(i / 7); var x = left + 15 + (right - left - 30) * ((column * 0.618 + row * 0.17) % 1); var y = gasTop + gasHeight * ((row * 0.47 + column * 0.23) % 1); dot(ctx, x, y, 2.6); }
        text(ctx, '氣體', 0, bottom + 18, 14);
    }, { keywords: ['活塞', '汽缸', '理想氣體', '熱力學'], modelNote: '裝置組裝示意。活塞位置、砝碼數、代表粒子數獨立調整，不會自動滿足 PV=nRT 或活塞受力平衡；px 不是實際體積。請在題幹補壓力、溫度、氣體量與過程條件；粒子數不是實際分子數。', suppressCommonLabel: true, parametric: pistonParametric });

    function thermalGraphParametric(type, defaults) {
        var controls = [control('width', '圖寬', 170, 430, 1, 'px'), control('height', '圖高', 110, 310, 1, 'px')];
        if (type === 'pvProcessGraph') {
            controls.push(choice('process', '顯示過程', [
                { value: 0, label: '四種過程比較' },
                { value: 1, label: '等壓過程' },
                { value: 2, label: '等容過程' },
                { value: 3, label: '等溫過程' },
                { value: 4, label: '絕熱過程' }
            ]));
            controls.push(control('gamma', '絕熱指數 γ', 1.1, 1.67, 0.01, ''));
            controls.push(control('volumeRatio', '終體積／初體積', 1.2, 4.5, 0.1, '倍'));
        }
        return smart(defaults, controls, { bounds: function (item) { var p = params(type, item); return { left: -p.width / 2 - 8, top: -p.height / 2 - 8, right: p.width / 2 + 8, bottom: p.height / 2 + 8 }; } });
    }

    add('thermal', 'pvProcessGraph', 'P–V 過程圖（可選）', 300, 210, function (ctx, item) {
        var p = params('pvProcessGraph', item); var a = axes(ctx, p.width, p.height, 'V', 'P'); var w = a.right - a.left; var h = a.bottom - a.top;
        var v0 = 0.2; var p0 = 0.82; var finalV = v0 * p.volumeRatio;
        if (p.process === 0 || p.process === 1) { stroke(ctx, [[a.left + v0 * w, a.bottom - p0 * h], [a.left + finalV * w, a.bottom - p0 * h]]); text(ctx, '等壓', a.left + finalV * w, a.bottom - p0 * h - 13, 13); }
        if (p.process === 0 || p.process === 2) { stroke(ctx, [[a.left + v0 * w, a.bottom - p0 * h], [a.left + v0 * w, a.bottom - 0.18 * h]]); text(ctx, '等容', a.left + v0 * w - 18, a.bottom - 0.25 * h, 13); }
        [1, p.gamma].forEach(function (exponent, index) {
            if (p.process !== 0 && p.process !== index + 3) return;
            begin(ctx);
            for (var i = 0; i <= 100; i += 1) { var volume = v0 + (finalV - v0) * i / 100; var pressure = p0 * Math.pow(v0 / volume, exponent); var x = a.left + w * volume; var y = a.bottom - h * pressure; if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
            ctx.stroke(); text(ctx, index ? '絕熱' : '等溫', a.left + finalV * w, a.bottom - h * p0 * Math.pow(v0 / finalV, exponent) + (index ? 14 : -14), 13);
        });
        dot(ctx, a.left + v0 * w, a.bottom - p0 * h, 3);
    }, { keywords: ['P-V圖', '等溫', '等壓', '等容', '絕熱'], suppressCommonLabel: true, parametric: thermalGraphParametric('pvProcessGraph', { width: 300, height: 210, process: 0, gamma: 1.4, volumeRatio: 4 }) });

    function cycleRows(p) {
        var dv = p.volumeHigh - p.volumeLow; var dp = p.pressureHigh - p.pressureLow;
        return [[p.volumeLow, p.pressureLow], [p.volumeLow + (p.shape ? 0.1 * dv : 0), p.pressureHigh - (p.shape ? 0.1 * dp : 0)], [p.volumeHigh, p.pressureHigh], [p.volumeHigh - (p.shape ? 0.1 * dv : 0), p.pressureLow + (p.shape ? 0.1 * dp : 0)]];
    }
    function cyclePlot(item) {
        var p = params('heatEngineCycle', item); var d = p.dataDomain;
        if (!Array.isArray(d) || d.length !== 4 || d.some(function (v) { return !Number.isFinite(v); }) || d[0] !== 0 || d[2] !== 0 || d[1] < p.volumeHigh || d[3] < p.pressureHigh || d[1] > 100 || d[3] > 100) d = [0, Math.ceil(p.volumeHigh * 1.25), 0, Math.ceil(p.pressureHigh * 1.25)];
        return library.dataPlotState({ type: item.type, params: { dataDomain: d } }, cycleRows(p), 'cycle', p.width, p.height);
    }
    var cycleParametric = smart(
        { width: 320, height: 240, shape: 1, direction: 1, volumeLow: 2, volumeHigh: 8, pressureLow: 1, pressureHigh: 5, solutionMode: 1, dataDomain: null },
        [choice('shape', '循環路徑', [{ value: 0, label: '矩形（兩段等壓、兩段等容）' }, { value: 1, label: '斜邊四段直線示意' }]), choice('direction', '循環方向', [{ value: 1, label: '順時針 A→B→C→D→A' }, { value: -1, label: '逆時針 A→D→C→B→A' }]), choice('solutionMode', '題目／解答', [{ value: 0, label: '題目（隱藏作功答案）' }, { value: 1, label: '解答（顯示淨作功）' }]), control('volumeLow', '最低體積', 0.5, 19, 0.1, 'L'), control('volumeHigh', '最高體積', 1, 20, 0.1, 'L'), control('pressureLow', '最低壓力', 0.5, 19, 0.1, 'kPa'), control('pressureHigh', '最高壓力', 1, 20, 0.1, 'kPa'), control('width', '圖寬', 260, 480, 1, 'px'), control('height', '圖高', 200, 360, 1, 'px')],
        {
            bounds: function (item) { var p = params('heatEngineCycle', item); return { left: -p.width / 2 - 8, top: -p.height / 2 - 8, right: p.width / 2 + 8, bottom: p.height / 2 + 30 }; },
            handles: function (item) { var p = params('heatEngineCycle', item); var s = cyclePlot(item); return [{ id: 'low-state', label: '狀態 A', x: s.x(p.volumeLow), y: s.y(p.pressureLow), primary: true }, { id: 'high-state', label: '狀態 C', x: s.x(p.volumeHigh), y: s.y(p.pressureHigh) }]; },
            update: function (item, id, point) {
                if (id !== 'low-state' && id !== 'high-state') return null;
                var p = params('heatEngineCycle', item); var s = cyclePlot(item); p.dataDomain = s.domain;
                var v = (point.x - s.area.left) / (s.area.right - s.area.left) * s.domain[1]; var pressure = s.valueY(point.y);
                if (id === 'low-state') { p.volumeLow = clamp(v, 0.5, p.volumeHigh - 0.5, p.volumeLow); p.pressureLow = clamp(pressure, 0.5, p.pressureHigh - 0.5, p.pressureLow); }
                else { p.volumeHigh = clamp(v, p.volumeLow + 0.5, Math.min(20, s.domain[1]), p.volumeHigh); p.pressureHigh = clamp(pressure, p.pressureLow + 0.5, Math.min(20, s.domain[3]), p.pressureHigh); }
                item.params = library.sanitizeParams('heatEngineCycle', p); return { readout: id === 'low-state' ? '狀態 A' : '狀態 C' };
            }
        }
    );
    var sanitizeCycle = cycleParametric.sanitize;
    cycleParametric.sanitize = function (source) {
        var p = sanitizeCycle(source);
        p.volumeHigh = Math.max(p.volumeLow + 0.5, p.volumeHigh); p.pressureHigh = Math.max(p.pressureLow + 0.5, p.pressureHigh);
        p.dataDomain = Array.isArray(source.dataDomain) ? source.dataDomain.slice(0, 4) : null;
        return p;
    };
    add('thermal', 'heatEngineCycle', '熱機循環 P–V 圖', 320, 240, function (ctx, item) {
        var p = params('heatEngineCycle', item); var s = cyclePlot(item); var rows = cycleRows(p);
        library.drawDataAxes(ctx, item, s, 'V (L)', 'P (kPa)');
        var points = rows.map(function (r) { return [s.x(r[0]), s.y(r[1])]; });
        path(ctx, points, true); ctx.stroke();
        points.forEach(function (a, i) {
            var b = points[(i + 1) % 4]; var dx = b[0] - a[0]; var dy = b[1] - a[1]; var length = Math.hypot(dx, dy); var sign = p.direction;
            var mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; var arrowLength = Math.min(10, length * 0.25);
            arrow(ctx, mid[0] - sign * dx / length * arrowLength / 2, mid[1] - sign * dy / length * arrowLength / 2, mid[0] + sign * dx / length * arrowLength / 2, mid[1] + sign * dy / length * arrowLength / 2, Math.min(6, length * 0.16));
            text(ctx, ['A', 'B', 'C', 'D'][i], a[0] + (i > 1 ? 10 : -10), a[1] + (i === 0 || i === 3 ? 12 : -12), 12);
        });
        if (p.solutionMode) {
            var area = Math.abs(rows.reduce(function (sum, a, i) { var b = rows[(i + 1) % 4]; return sum + (a[1] + b[1]) / 2 * (b[0] - a[0]); }, 0));
            text(ctx, '氣體淨作功 W = ' + (p.direction < 0 ? '−' : '+') + Number(area.toPrecision(4)) + ' J', 0, p.height / 2 + 17, 12);
        }
    }, { keywords: ['熱機', '循環', 'P-V圖', '作功'], modelNote: 'A、C 可拖曳，其他狀態依所選路徑連動；座標單位為 kPa、L，面積單位為 J。高低值至少差 0.5，衝突時最高值會上調。順時針表示氣體淨作正功，逆時針為負功。斜邊模式是直線過程，不是等溫／絕熱或卡諾循環；題目模式隱藏作功答案。', suppressCommonLabel: true, parametric: cycleParametric });

    function heatingRows(p) {
        var temperatures = [p.startTemperature, p.meltTemperature, p.meltTemperature, p.boilTemperature, p.boilTemperature, p.endTemperature];
        var amounts = [p.solidHeat, p.fusionHeat, p.liquidHeat, p.vaporHeat, p.gasHeat]; var q = 0;
        var rows = [[0, temperatures[0]]];
        amounts.forEach(function (value, i) { q += value; rows.push([q, temperatures[i + 1]]); });
        if (p.cooling) rows = rows.slice().reverse().map(function (r) { return [q - r[0], r[1]]; });
        return rows.map(function (r) { return [r[0] / (p.axisMode ? p.power : 1), r[1]]; });
    }
    function heatingPlot(item) { var p = params('heatingCurve', item); return library.dataPlotState(item, heatingRows(p), 'heating', p.width, p.height); }
    var heatingParametric = smart(
        { width: 370, height: 260, axisMode: 0, cooling: 0, startTemperature: -30, meltTemperature: 0, boilTemperature: 100, endTemperature: 150, solidHeat: 60, fusionHeat: 100, liquidHeat: 120, vaporHeat: 120, gasHeat: 60, power: 1, showStages: 1 },
        [choice('cooling', '熱傳方向', [{ value: 0, label: '加熱（吸收熱量）' }, { value: 1, label: '冷卻（放出熱量）' }]), choice('axisMode', '橫軸', [{ value: 0, label: '吸收／放出熱量大小 Q' }, { value: 1, label: '時間 t（定功率）' }]), choice('showStages', '相態提示', [{ value: 1, label: '顯示' }, { value: 0, label: '隱藏（題目）' }]), control('startTemperature', '固態端點溫度', -250, 450, 1, '°C'), control('meltTemperature', '熔化／凝固溫度', -249, 470, 1, '°C'), control('boilTemperature', '沸騰／凝結溫度', -248, 490, 1, '°C'), control('endTemperature', '氣態端點溫度', -247, 500, 1, '°C'), control('solidHeat', '固態段熱量', 1, 2000, 1, 'kJ'), control('fusionHeat', '熔化／凝固潛熱量', 1, 2000, 1, 'kJ'), control('liquidHeat', '液態段熱量', 1, 2000, 1, 'kJ'), control('vaporHeat', '沸騰／凝結潛熱量', 1, 2000, 1, 'kJ'), control('gasHeat', '氣態段熱量', 1, 2000, 1, 'kJ'), control('power', '恆定熱傳功率大小', 0.1, 10, 0.1, 'kW'), control('width', '圖寬', 300, 600, 1, 'px'), control('height', '圖高', 220, 380, 1, 'px')],
        {
            getControls: function (item) { var p = params('heatingCurve', item); return heatingParametric.controls.filter(function (c) { return c.key !== 'power' || p.axisMode === 1; }); },
            bounds: function (item) { var p = params('heatingCurve', item); return { left: -p.width / 2 - 8, top: -p.height / 2 - 8, right: p.width / 2 + 8, bottom: p.height / 2 + 8 }; },
            handles: function (item) {
                var p = params('heatingCurve', item); var s = heatingPlot(item); var rows = heatingRows(p);
                return [{ id: 'fusion', label: '熔化／凝固平台', x: s.x(rows[p.cooling ? 3 : 2][0]), y: s.y(p.meltTemperature), primary: true }, { id: 'vapor', label: '沸騰／凝結平台', x: s.x(rows[p.cooling ? 1 : 4][0]), y: s.y(p.boilTemperature) }];
            },
            update: function (item, id, point) {
                if (id !== 'fusion' && id !== 'vapor') return null;
                var p = params('heatingCurve', item); var s = heatingPlot(item);
                var q = clamp((point.x - s.area.left) / (s.area.right - s.area.left), 0, 1, 0) * s.domain[1] * (p.axisMode ? p.power : 1);
                var total = p.solidHeat + p.fusionHeat + p.liquidHeat + p.vaporHeat + p.gasHeat;
                if (p.cooling) q = total - q;
                if (id === 'fusion') {
                    var pair = p.fusionHeat + p.liquidHeat;
                    p.fusionHeat = Math.round(clamp(q - p.solidHeat, Math.max(1, pair - 2000), Math.min(2000, pair - 1), p.fusionHeat)); p.liquidHeat = pair - p.fusionHeat;
                    p.meltTemperature = clamp(s.valueY(point.y), p.startTemperature + 1, p.boilTemperature - 1, p.meltTemperature);
                } else {
                    var endPair = p.vaporHeat + p.gasHeat;
                    p.vaporHeat = Math.round(clamp(q - p.solidHeat - p.fusionHeat - p.liquidHeat, Math.max(1, endPair - 2000), Math.min(2000, endPair - 1), p.vaporHeat)); p.gasHeat = endPair - p.vaporHeat;
                    p.boilTemperature = clamp(s.valueY(point.y), p.meltTemperature + 1, p.endTemperature - 1, p.boilTemperature);
                }
                item.params = library.sanitizeParams('heatingCurve', p); return { readout: id === 'fusion' ? item.params.meltTemperature + ' °C' : item.params.boilTemperature + ' °C' };
            }
        }
    );
    var sanitizeHeating = heatingParametric.sanitize;
    heatingParametric.sanitize = function (source) {
        var p = sanitizeHeating(source);
        p.meltTemperature = Math.max(p.startTemperature + 1, p.meltTemperature); p.boilTemperature = Math.max(p.meltTemperature + 1, p.boilTemperature); p.endTemperature = Math.max(p.boilTemperature + 1, p.endTemperature);
        return p;
    };
    add('thermal', 'heatingCurve', '加熱／冷卻相變曲線', 370, 260, function (ctx, item) {
        var p = params('heatingCurve', item); var s = heatingPlot(item); var rows = heatingRows(p); var points = rows.map(function (r) { return [s.x(r[0]), s.y(r[1])]; });
        library.drawDataAxes(ctx, item, s, p.axisMode ? 't (s)' : (p.cooling ? '放出熱量 Q (kJ)' : '吸收熱量 Q (kJ)'), 'T (°C)');
        stroke(ctx, points);
        if (p.showStages) (p.cooling ? ['氣體', '凝結', '液體', '凝固', '固體'] : ['固體', '熔化', '液體', '沸騰', '氣體']).forEach(function (label, i) {
            var a = points[i]; var b = points[i + 1];
            // Tiny physical intervals remain tiny; omit crowded text rather than distort data.
            var labelY = (a[1] + b[1]) / 2 - 13;
            if (Math.abs(labelY - s.y(0)) < 10) labelY = s.y(0) - 14;
            if (b[0] - a[0] >= 28) text(ctx, label, (a[0] + b[0]) / 2, labelY, 11);
        });
    }, { keywords: ['加熱曲線', '冷卻曲線', '相變', '熔化', '沸騰', '潛熱'], modelNote: '定壓純物質的五段理想曲線，預設數值不是特定物質。各段熱量是本份樣品的總量，不是比熱或比潛熱；定功率模式用 t=Q/P。溫度須依固態端、熔點、沸點、氣態端遞增，衝突時後一溫度會上調。拖曳平台改變溫度與平台終點；橫拖會補償相鄰單相區段，保持總熱量與座標尺度。太短的區段省略文字，避免重疊；仍保留真實比例。', suppressCommonLabel: true, parametric: heatingParametric });

    var speedDistributionParametric = smart(
        { width: 320, height: 220, temperature: 1, secondTemperature: 1.7 },
        [control('width', '圖寬', 180, 430, 1, 'px'), control('height', '圖高', 120, 310, 1, 'px'), control('temperature', '溫度 T₁', 0.5, 2.2, 0.1, '倍'), control('secondTemperature', '溫度 T₂', 0.7, 3, 0.1, '倍')],
        { bounds: function (item) { var p = params('speedDistribution', item); return { left: -p.width / 2 - 8, top: -p.height / 2 - 8, right: p.width / 2 + 8, bottom: p.height / 2 + 8 }; } }
    );
    add('thermal', 'speedDistribution', '分子速率分布', 320, 220, function (ctx, item) {
        var p = params('speedDistribution', item); var a = axes(ctx, p.width, p.height, 'v', 'f(v)'); var w = a.right - a.left; var h = a.bottom - a.top;
        function curve(temp, dash, label, labelIndex) { ctx.save(); if (dash) ctx.setLineDash([6, 5]); begin(ctx); for (var i = 0; i <= 140; i += 1) { var u = i / 140 * 4.5; var value = u * u * Math.exp(-u * u / temp) / Math.pow(temp, 1.5); var x = a.left + w * i / 140; var y = a.bottom - value * 1.6 * h; if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.stroke(); ctx.restore(); text(ctx, label + '=' + temp.toFixed(1) + '×', a.left + w * (0.38 + labelIndex * 0.28), a.top + 22 + labelIndex * 20, 12); }
        curve(p.temperature, false, 'T₁', 0); curve(p.secondTemperature, true, 'T₂', 1);
    }, { keywords: ['馬克士威分布', '分子速率', '溫度'], suppressCommonLabel: true, parametric: speedDistributionParametric });

    var calorimeterParametric = smart(
        { width: 160, height: 150, thermometer: 85, heatArrow: 55 },
        [control('width', '容器寬度', 100, 240, 1, 'px'), control('height', '容器高度', 90, 230, 1, 'px'), control('thermometer', '溫度計深度', 45, 150, 1, 'px'), control('heatArrow', '熱流箭頭', -90, 90, 1, 'px')],
        {
            sanitize: function (source) {
                var incoming = source && typeof source === 'object' ? source : {};
                var height = Math.round(clamp(incoming.height, 90, 230, 150));
                var minimumDepth = Math.max(45, height / 2 + 8);
                var maximumDepth = Math.min(150, height - 15);
                return {
                    width: Math.round(clamp(incoming.width, 100, 240, 160)), height: height,
                    thermometer: Math.round(clamp(incoming.thermometer, minimumDepth, maximumDepth, Math.min(85, maximumDepth))),
                    heatArrow: Math.round(clamp(incoming.heatArrow, -90, 90, 55))
                };
            },
            bounds: function (item) { var p = params('calorimeter', item); return { left: -p.width / 2 - 20, top: -p.height / 2 - 42, right: p.width / 2 + Math.max(102, 80 - p.heatArrow), bottom: p.height / 2 + 16 }; }
        }
    );
    add('thermal', 'calorimeter', '量熱器與熱流', 300, 260, function (ctx, item) {
        var p = params('calorimeter', item); var left = -p.width / 2; var right = p.width / 2; var top = -p.height / 2; var bottom = p.height / 2;
        stroke(ctx, [[left, top], [left, bottom], [right, bottom], [right, top]]); stroke(ctx, [[left - 8, top], [right + 8, top]]);
        ctx.save(); ctx.globalAlpha = 0.1; ctx.fillStyle = ctx.strokeStyle; ctx.fillRect(left + 3, -5, p.width - 6, bottom + 2); ctx.restore(); stroke(ctx, [[left + 3, -5], [right - 3, -5]]);
        stroke(ctx, [[-28, top - 30], [-28, top + p.thermometer]]); circle(ctx, -28, top + p.thermometer, 7, true); text(ctx, 'T', -42, top - 19, 14);
        if (Math.abs(p.heatArrow) > 3) arrow(ctx, right + 68, 0, right + 68 - p.heatArrow, 0, 8); text(ctx, 'Q', right + 68 - p.heatArrow / 2, -15, 15);
    }, { keywords: ['量熱器', '熱量', '比熱', '混合熱平衡'], suppressCommonLabel: true, parametric: calorimeterParametric });

    /* Physics-specific graph set. */
    function graphPackParametric(type, defaults) {
        return smart(defaults, [control('width', '圖寬', 170, 450, 1, 'px'), control('height', '圖高', 110, 320, 1, 'px'), control('level', '特徵高度', 0.2, 1.4, 0.1, '')], { bounds: function (item) { var p = params(type, item); return { left: -p.width / 2 - 8, top: -p.height / 2 - 8, right: p.width / 2 + 8, bottom: p.height / 2 + 8 }; } });
    }
    function graphPackAxes(ctx, p, x, y) { return axes(ctx, p.width, p.height, x, y); }

    function graphNumber(value) { return value === 0 ? '0' : Number(value.toPrecision(5)).toString(); }
    function graphFrame(item, bottomExtra) { var p = params(item.type, item); return { left: -p.width / 2 - 8, top: -p.height / 2 - 8, right: p.width / 2 + 8, bottom: p.height / 2 + (bottomExtra || 8) }; }
    function signedDataPlot(item, rows) {
        var p = params(item.type, item); var s = library.dataPlotState(item, rows, 'ordered', p.width, p.height);
        // Initially leave equal room for either sign; once dragging starts, keep
        // the accepted axis domain unchanged so the handle follows the pointer.
        if (Array.isArray(p.dataDomain) && s.domain.every(function (v, i) { return v === p.dataDomain[i]; })) return s;
        var extent = Math.max(Math.abs(s.domain[2]), Math.abs(s.domain[3]));
        return library.dataPlotState({ type: item.type, params: { dataDomain: [s.domain[0], s.domain[1], -extent, extent] } }, rows, 'ordered', p.width, p.height);
    }
    function graphDataChoice() { return choice('dataMode', '資料來源', [{ value: 0, label: '簡易參數' }, { value: 1, label: '自訂多段資料' }]); }
    function plateRows(p) { return [[0, 0], [p.plateLeft, 0], [p.plateLeft, p.field], [p.plateRight, p.field], [p.plateRight, 0], [10, 0]]; }
    function fieldRows(item) { var p = params(item.type, item); return p.dataMode ? p.dataPoints : plateRows(p); }
    function potentialRows(item) {
        var p = params(item.type, item); var rows = fieldRows(item); var output = [];
        function addPoint(x) { output.push([x, p.referenceValue - library.integrateLinearData(rows, p.referenceX, x)]); }
        addPoint(rows[0][0]);
        for (var i = 1; i < rows.length; i += 1) {
            var a = rows[i - 1]; var b = rows[i]; var fractions = [];
            if (b[0] === a[0]) { addPoint(b[0]); continue; }
            for (var j = 1; j <= 16; j += 1) fractions.push(j / 16);
            if (p.referenceX > a[0] && p.referenceX < b[0]) fractions.push((p.referenceX - a[0]) / (b[0] - a[0]));
            if (a[1] * b[1] < 0) fractions.push(-a[1] / (b[1] - a[1]));
            fractions.sort(function (x, y) { return x - y; }).forEach(function (f) { addPoint(a[0] + f * (b[0] - a[0])); });
        }
        return output;
    }
    function fieldGraphParametric(type) {
        var potential = type === 'electricPotentialPositionGraph';
        var defaults = { width: 340, height: 240, level: 1, field: null, plateLeft: 2, plateRight: 8, dataMode: 0, dataPoints: [], dataDomain: null, referenceX: 0, referenceValue: 0 };
        var controls = [graphDataChoice(), control('field', '板間電場（正值朝 +x）', -100, 100, 0.1, 'V/m'), control('plateLeft', '左板位置', 0, 9.9, 0.1, 'm'), control('plateRight', '右板位置', 0.1, 10, 0.1, 'm')];
        if (potential) controls.push(control('referenceX', '參考位置', -1000000, 1000000, 0.1, 'm'), control('referenceValue', '參考位置的電位', -1000000, 1000000, 0.1, 'V'));
        controls.push(control('width', '圖寬', 260, 520, 1, 'px'), control('height', '圖高', 200, 400, 1, 'px'));
        var config = smart(defaults, controls, {
            bounds: function (item) { return graphFrame(item, potential ? 30 : 8); },
            getControls: function (item) { var p = params(type, item); var rows = fieldRows(item); return controls.filter(function (c) { return !p.dataMode || ['field', 'plateLeft', 'plateRight'].indexOf(c.key) < 0; }).map(function (c) { return c.key === 'referenceX' ? Object.assign({}, c, { min: rows[0][0], max: rows[rows.length - 1][0], continuous: true }) : c; }); },
            handles: function (item) {
                var p = params(type, item); var rows = potential ? potentialRows(item) : fieldRows(item); var s = potential ? library.dataPlotState(item, rows, 'ordered', p.width, p.height) : signedDataPlot(item, rows);
                if (potential) return [{ id: 'reference', label: '參考電位', x: s.x(p.referenceX), y: s.y(p.referenceValue), primary: true, readout: 'V=' + graphNumber(p.referenceValue) + ' V' }];
                if (p.dataMode) return rows.map(function (r, i) { return { id: 'data-' + i, label: '電場 ' + (i + 1), x: s.x(r[0]), y: s.y(r[1]), primary: i === 0 }; });
                return [{ id: 'field', label: '板間電場', x: s.x((p.plateLeft + p.plateRight) / 2), y: s.y(p.field), primary: true }, { id: 'left-plate', label: '左板', x: s.x(p.plateLeft), y: s.y(0) }, { id: 'right-plate', label: '右板', x: s.x(p.plateRight), y: s.y(0) }];
            },
            update: function (item, id, point) {
                var p = params(type, item); var rows = potential ? potentialRows(item) : fieldRows(item); var s = potential ? library.dataPlotState(item, rows, 'ordered', p.width, p.height) : signedDataPlot(item, rows);
                if (potential) {
                    if (id !== 'reference') return null;
                    var low = Math.min.apply(null, rows.map(function (r) { return r[1]; })); var high = Math.max.apply(null, rows.map(function (r) { return r[1]; }));
                    var shift = clamp(s.valueY(point.y) - p.referenceValue, s.domain[2] - low, s.domain[3] - high, 0);
                    p.referenceValue = clamp(p.referenceValue + shift, -1000000, 1000000, p.referenceValue);
                    p.dataDomain = s.domain;
                } else if (p.dataMode && id.indexOf('data-') === 0) {
                    var index = Number(id.slice(5)); if (!p.dataPoints[index]) return null;
                    p.dataDomain = s.domain; p.dataPoints[index][1] = Number(clamp(s.valueY(point.y), Math.max(-1000000, s.domain[2]), Math.min(1000000, s.domain[3]), p.dataPoints[index][1]).toPrecision(10));
                } else if (id === 'field') { p.dataDomain = s.domain; p.field = clamp(s.valueY(point.y), Math.max(-100, s.domain[2]), Math.min(100, s.domain[3]), p.field); }
                else if (id === 'left-plate' || id === 'right-plate') {
                    var x = s.domain[0] + (point.x - s.area.left) / (s.area.right - s.area.left) * (s.domain[1] - s.domain[0]);
                    if (id === 'left-plate') p.plateLeft = clamp(x, 0, p.plateRight - 0.1, p.plateLeft); else p.plateRight = clamp(x, p.plateLeft + 0.1, 10, p.plateRight);
                } else return null;
                item.params = library.sanitizeParams(type, p); return { readout: potential ? 'V=' + graphNumber(item.params.referenceValue) + ' V' : '電場／板位置已調整' };
            }
        });
        var sanitize = config.sanitize;
        config.sanitize = function (source) {
            var p = sanitize(source);
            if (source.field == null) p.field = clamp(number(source.level, 1) * 5, -100, 100, 5);
            p.plateRight = Math.max(p.plateLeft + 0.1, p.plateRight);
            p.dataPoints = !library.validateDataRows(source.dataPoints, 'ordered') ? source.dataPoints.map(function (r) { return r.slice(); }) : [];
            if (p.dataMode && !p.dataPoints.length) p.dataPoints = plateRows(p);
            p.dataDomain = Array.isArray(source.dataDomain) ? source.dataDomain.slice(0, 4) : null;
            var rows = p.dataMode ? p.dataPoints : plateRows(p);
            p.referenceX = clamp(source.referenceX, rows[0][0], rows[rows.length - 1][0], 0);
            return p;
        };
        return config;
    }
    function fieldDataEditor() {
        return { columns: ['x', 'E'], kind: 'ordered', hint: '每行輸入 x（m）、E（V/m），x 由小到大；可重複 x 表示電場跳變。電位圖也輸入電場 E，會依 ΔV=−∫E dx 生成，不能把 V 數值貼在 E 欄。只畫資料涵蓋範圍，不外推。', rows: fieldRows, apply: function (item, rows) { item.params = library.sanitizeParams(item.type, Object.assign({}, item.params, { dataMode: 1, dataPoints: rows, dataDomain: null })); } };
    }
    ['electricFieldPositionGraph', 'electricPotentialPositionGraph'].forEach(function (type) {
        var potential = type === 'electricPotentialPositionGraph';
        add('graphs', type, potential ? '電位－位置圖' : '電場－位置圖', 340, 240, function (ctx, item) {
            var p = params(type, item); var rows = potential ? potentialRows(item) : fieldRows(item); var s = potential ? library.dataPlotState(item, rows, 'ordered', p.width, p.height) : signedDataPlot(item, rows);
            library.drawDataAxes(ctx, item, s, 'x (m)', potential ? 'V (V)' : 'E (V/m)');
            if (!p.dataMode) { dashed(ctx, [[s.x(p.plateLeft), s.area.top], [s.x(p.plateLeft), s.area.bottom]]); dashed(ctx, [[s.x(p.plateRight), s.area.top], [s.x(p.plateRight), s.area.bottom]]); }
            stroke(ctx, rows.map(function (r) { return [s.x(r[0]), s.y(r[1])]; }));
            if (potential) { dot(ctx, s.x(p.referenceX), s.y(p.referenceValue), 3); text(ctx, 'V(' + graphNumber(p.referenceX) + ' m) = ' + graphNumber(p.referenceValue) + ' V', 0, p.height / 2 + 16, 12); }
        }, { keywords: potential ? ['電位位置圖', 'V-x圖', '電勢'] : ['電場位置圖', 'E-x圖', '均勻電場'], modelNote: '一維沿 x 的電場分量；正 E 表示朝 +x，電位由 ΔV=−∫E dx 連續生成。簡易模式為理想平行板、忽略邊緣效應，板外 E=0。自訂資料以直線連接各段 E；電位可能是拋物線而非折線。兩張素材使用相同模型，但分開放入畫布後不會自動同步，請使用相同 E 資料與板位置。', dataEditor: fieldDataEditor(), suppressCommonLabel: true, parametric: fieldGraphParametric(type) });
    });

    var ivParametric = graphPackParametric('ivCharacteristicGraph', { width: 310, height: 220, level: 1, curveMode: 0 });
    ivParametric.controls.push(choice('curveMode', '顯示曲線', [{ value: 0, label: '比較兩種元件' }, { value: 1, label: '只顯示歐姆元件' }, { value: 2, label: '只顯示二極體' }]));
    add('graphs', 'ivCharacteristicGraph', 'I–V 特性曲線', 310, 220, function (ctx, item) {
        var p = params('ivCharacteristicGraph', item); var a = graphPackAxes(ctx, p, 'V', 'I'); var w = a.right - a.left; var h = a.bottom - a.top;
        var response = Math.min(1, p.level / 1.4);
        if (p.curveMode !== 2) { stroke(ctx, [[a.left, a.bottom], [a.right - 0.05 * w, a.bottom - h * 0.9 * response]]); text(ctx, '歐姆元件', a.right - 0.22 * w, a.top + 18, 12); }
        if (p.curveMode !== 1) { begin(ctx); for (var i = 0; i <= 100; i += 1) { var t = i / 100; var x = a.left + 0.08 * w + 0.84 * w * t; var y = a.bottom - 0.05 * h - 0.86 * h * response * Math.pow(t, 3.5); if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.stroke(); text(ctx, '二極體', a.right - 0.18 * w, a.bottom - 0.23 * h * Math.max(0.65, response), 12); }
    }, { keywords: ['I-V圖', '伏安特性', '歐姆元件', '二極體'], modelNote: '可分別顯示歐姆／二極體曲線。二極體為定性示意，非實測或 Shockley 方程，不提供反向偏壓區。', suppressCommonLabel: true, parametric: ivParametric });

    function forceRows(item) { var p = params('forceDisplacementGraph', item); return p.dataMode ? p.dataPoints : [[0, p.force], [10, p.force]]; }
    var forceGraphParametric = smart(
        { width: 340, height: 240, level: 1, force: null, dataMode: 0, dataPoints: [], dataDomain: null, workFrom: 0, workTo: 10, solutionMode: 1 },
        [graphDataChoice(), control('force', '沿 +x 的力分量', -100, 100, 0.1, 'N'), control('workFrom', '作功起點', -1000000, 1000000, 0.1, 'm'), control('workTo', '作功終點', -1000000, 1000000, 0.1, 'm'), choice('solutionMode', '題目／解答', [{ value: 0, label: '題目（隱藏陰影與答案）' }, { value: 1, label: '解答（有向面積與作功）' }]), control('width', '圖寬', 260, 520, 1, 'px'), control('height', '圖高', 200, 400, 1, 'px')],
        {
            bounds: function (item) { return graphFrame(item, 50); },
            getControls: function (item) { var p = params(item.type, item); var rows = forceRows(item); return forceGraphParametric.controls.filter(function (c) { return c.key !== 'force' || !p.dataMode; }).map(function (c) { return c.key === 'workFrom' || c.key === 'workTo' ? Object.assign({}, c, { min: rows[0][0], max: rows[rows.length - 1][0], continuous: true }) : c; }); },
            handles: function (item) {
                var p = params(item.type, item); var rows = forceRows(item); var s = signedDataPlot(item, rows);
                var handles = p.dataMode ? rows.map(function (r, i) { return { id: 'data-' + i, label: '力 ' + (i + 1), x: s.x(r[0]), y: s.y(r[1]) }; }) : [{ id: 'force', label: '力大小／正負', x: s.x(5), y: s.y(p.force), primary: true }];
                return handles.concat([{ id: 'from', label: '作功起點', x: s.x(p.workFrom), y: s.area.bottom }, { id: 'to', label: '作功終點', x: s.x(p.workTo), y: s.area.bottom }]);
            },
            update: function (item, id, point) {
                var p = params(item.type, item); var rows = forceRows(item); var s = signedDataPlot(item, rows); p.dataDomain = s.domain;
                if (id === 'from' || id === 'to') p[id === 'from' ? 'workFrom' : 'workTo'] = s.domain[0] + (point.x - s.area.left) / (s.area.right - s.area.left) * (s.domain[1] - s.domain[0]);
                else if (id === 'force' && !p.dataMode) p.force = clamp(s.valueY(point.y), Math.max(-100, s.domain[2]), Math.min(100, s.domain[3]), p.force);
                else if (id.indexOf('data-') === 0 && p.dataMode) { var index = Number(id.slice(5)); if (!p.dataPoints[index]) return null; p.dataPoints[index][1] = Number(clamp(s.valueY(point.y), Math.max(-1000000, s.domain[2]), Math.min(1000000, s.domain[3]), p.dataPoints[index][1]).toPrecision(10)); }
                else return null;
                item.params = library.sanitizeParams(item.type, p); return { readout: '作功區間／力已更新' };
            }
        }
    );
    var sanitizeForceGraph = forceGraphParametric.sanitize;
    forceGraphParametric.sanitize = function (source) {
        var p = sanitizeForceGraph(source); if (source.force == null) p.force = clamp(number(source.level, 1) * 5, -100, 100, 5);
        p.dataPoints = !library.validateDataRows(source.dataPoints, 'ordered') ? source.dataPoints.map(function (r) { return r.slice(); }) : [];
        if (p.dataMode && !p.dataPoints.length) p.dataPoints = [[0, p.force], [10, p.force]];
        p.dataDomain = Array.isArray(source.dataDomain) ? source.dataDomain.slice(0, 4) : null;
        var rows = p.dataMode ? p.dataPoints : [[0, p.force], [10, p.force]];
        p.workFrom = clamp(source.workFrom, rows[0][0], rows[rows.length - 1][0], rows[0][0]); p.workTo = clamp(source.workTo, rows[0][0], rows[rows.length - 1][0], rows[rows.length - 1][0]);
        return p;
    };
    add('graphs', 'forceDisplacementGraph', '力－位移作功圖', 340, 240, function (ctx, item) {
        var p = params(item.type, item); var rows = forceRows(item); var s = signedDataPlot(item, rows);
        library.drawDataAxes(ctx, item, s, 'x (m)', 'F (N)');
        if (p.solutionMode) {
            var lo = Math.min(p.workFrom, p.workTo); var hi = Math.max(p.workFrom, p.workTo);
            ctx.save(); ctx.globalAlpha = 0.13; ctx.fillStyle = ctx.strokeStyle;
            for (var i = 1; i < rows.length; i += 1) {
                var a = rows[i - 1]; var b = rows[i]; var start = Math.max(lo, a[0]); var end = Math.min(hi, b[0]);
                if (end <= start || b[0] <= a[0]) continue;
                var first = a[1] + (b[1] - a[1]) * (start - a[0]) / (b[0] - a[0]); var last = a[1] + (b[1] - a[1]) * (end - a[0]) / (b[0] - a[0]);
                var pieces = [[start, first], [end, last]];
                if (first * last < 0) pieces.splice(1, 0, [start - first * (end - start) / (last - first), 0]);
                for (var j = 1; j < pieces.length; j += 1) { path(ctx, [[s.x(pieces[j - 1][0]), s.y(0)], [s.x(pieces[j - 1][0]), s.y(pieces[j - 1][1])], [s.x(pieces[j][0]), s.y(pieces[j][1])], [s.x(pieces[j][0]), s.y(0)]], true); ctx.fill(); }
            }
            ctx.restore();
        }
        stroke(ctx, rows.map(function (r) { return [s.x(r[0]), s.y(r[1])]; }));
        [p.workFrom, p.workTo].forEach(function (x) { dashed(ctx, [[s.x(x), s.area.top], [s.x(x), s.area.bottom]]); });
        text(ctx, '作功路徑：' + graphNumber(p.workFrom) + ' → ' + graphNumber(p.workTo) + ' m', 0, p.height / 2 + 14, 12);
        if (p.solutionMode) text(ctx, 'W = ' + graphNumber(library.integrateLinearData(rows, p.workFrom, p.workTo)) + ' J', 0, p.height / 2 + 34, 12);
    }, { keywords: ['力位移圖', 'F-x圖', '作功', '面積'], modelNote: 'F 是沿 x 的力分量，可為負值；作功為指定起點到終點的有向面積，反向位移會反轉積分符號。區間限制在資料範圍內，可起終點相同（零功）。自訂資料以直線連接，可用相同 x 表示力跳變；不表示來回路徑或隨歷史改變的摩擦力。', dataEditor: { columns: ['x', 'F'], kind: 'ordered', hint: '每行 x（m）、F（N），x 由小到大；負 F 朝 −x。可貼上多段／階梯資料。套用時作功區間重設為整份資料，之後可改起終點；藍點上下改力，各資料點的 x 由表格設定。', rows: forceRows, apply: function (item, rows) { item.params = library.sanitizeParams(item.type, Object.assign({}, item.params, { dataMode: 1, dataPoints: rows, dataDomain: null, workFrom: rows[0][0], workTo: rows[rows.length - 1][0] })); } }, suppressCommonLabel: true, parametric: forceGraphParametric });

    function potentialValue(p, x) {
        return p.offset + p.coefficient * (p.shape === 2 ? Math.pow(x * x - p.wellPosition * p.wellPosition, 2) : (p.shape === 1 ? -x * x : x * x));
    }
    function potentialState(item) {
        var p = params('potentialEnergyGraph', item); var rows = []; var roots = []; var q = (p.energy - p.offset) / p.coefficient;
        if (p.shape === 2 && q >= 0) {
            [p.wellPosition * p.wellPosition - Math.sqrt(q), p.wellPosition * p.wellPosition + Math.sqrt(q)].forEach(function (s) { if (s >= 0) roots.push(-Math.sqrt(s), Math.sqrt(s)); });
        } else if (p.shape !== 2 && (p.shape === 1 ? -q : q) >= 0) {
            var r = Math.sqrt(p.shape === 1 ? -q : q); roots.push(-r, r);
        }
        roots = roots.filter(function (x, i, list) { return Math.abs(x) <= p.extent && list.findIndex(function (v) { return Math.abs(v - x) < 1e-8; }) === i; }).sort(function (a, b) { return a - b; });
        var xs = [0].concat(roots);
        if (p.shape === 2 && p.wellPosition <= p.extent) xs.push(-p.wellPosition, p.wellPosition);
        for (var i = 0; i <= 160; i += 1) xs.push(-p.extent + 2 * p.extent * i / 160);
        xs.sort(function (a, b) { return a - b; }).forEach(function (x) { rows.push([x, potentialValue(p, x)]); });
        var plot = library.dataPlotState(item, rows.concat([[-p.extent, p.energy], [p.extent, p.energy]]), 'ordered', p.width, p.height);
        return { p: p, rows: rows, roots: roots, plot: plot };
    }
    var potentialParametric = smart(
        { width: 380, height: 280, shape: 0, coefficient: null, level: 1, offset: 0, energy: 4, extent: 3, wellPosition: 1.5, solutionMode: 1, dataDomain: null },
        [choice('shape', '位能模型', [{ value: 0, label: '單井 U = C + A x²' }, { value: 1, label: '位能丘 U = C − A x²' }, { value: 2, label: '雙井 U = C + A(x² − b²)²' }]), control('coefficient', '係數 A（依模型為 J/m² 或 J/m⁴）', 0.1, 10, 0.1, ''), control('offset', '位能零點偏移 C', -20, 20, 0.1, 'J'), control('wellPosition', '雙井谷底位置 ±b', 0.5, 4, 0.1, 'm'), control('energy', '機械能 E', -1000, 1000, 0.1, 'J'), control('extent', '顯示位置範圍 ±x', 1, 6, 0.1, 'm'), choice('solutionMode', '題目／解答', [{ value: 0, label: '題目（只留 U 曲線與 E 線）' }, { value: 1, label: '解答（標記 E=U 與允許區）' }]), control('width', '圖寬', 300, 560, 1, 'px'), control('height', '圖高', 240, 420, 1, 'px')],
        {
            bounds: function (item) { return graphFrame(item, 58); },
            getControls: function (item) { var p = params(item.type, item); return potentialParametric.controls.filter(function (c) { return c.key !== 'wellPosition' || p.shape === 2; }); },
            handles: function (item) { var s = potentialState(item); return [{ id: 'energy', label: '機械能 E', x: s.plot.x(s.p.extent * 0.8), y: s.plot.y(s.p.energy), primary: true, readout: graphNumber(s.p.energy) + ' J' }]; },
            update: function (item, id, point) { if (id !== 'energy') return null; var s = potentialState(item); s.p.energy = s.plot.valueY(point.y); s.p.dataDomain = s.plot.domain; item.params = library.sanitizeParams(item.type, s.p); return { readout: 'E=' + graphNumber(item.params.energy) + ' J' }; }
        }
    );
    var sanitizePotential = potentialParametric.sanitize;
    potentialParametric.sanitize = function (source) { var p = sanitizePotential(source); if (source.coefficient == null) p.coefficient = clamp(source.level, 0.1, 10, 1); p.dataDomain = source.dataDomain; return p; };
    add('graphs', 'potentialEnergyGraph', '位能－位置圖', 380, 340, function (ctx, item) {
        var s = potentialState(item); var p = s.p; var a = s.plot;
        library.drawDataAxes(ctx, item, a, 'x (m)', 'U, E (J)');
        stroke(ctx, s.rows.map(function (r) { return [a.x(r[0]), a.y(r[1])]; }));
        dashed(ctx, [[a.x(-p.extent), a.y(p.energy)], [a.x(p.extent), a.y(p.energy)]]);
        text(ctx, 'E = ' + graphNumber(p.energy) + ' J', 0, p.height / 2 + 12, 12);
        if (!p.solutionMode) return;
        s.roots.forEach(function (x) { circle(ctx, a.x(x), a.y(p.energy), 3, true); });
        var cuts = [-p.extent].concat(s.roots, [p.extent]); var allowed = false;
        ctx.save(); ctx.lineWidth *= 3;
        for (var i = 1; i < cuts.length; i += 1) if (cuts[i] > cuts[i - 1] && potentialValue(p, (cuts[i] + cuts[i - 1]) / 2) <= p.energy) { allowed = true; stroke(ctx, [[a.x(cuts[i - 1]), a.area.bottom + 3], [a.x(cuts[i]), a.area.bottom + 3]]); }
        ctx.restore();
        text(ctx, s.roots.length ? 'E=U：x=' + s.roots.map(graphNumber).join(', ') + ' m' : '顯示範圍內無 E=U 交點', 0, p.height / 2 + 30, 11);
        text(ctx, allowed ? '底部粗線：U≤E 的可達位置區間' : (s.roots.length ? '僅有平衡位置；沒有可運動區間' : '顯示範圍內無可達位置'), 0, p.height / 2 + 48, 11);
    }, { keywords: ['位能圖', 'U-x圖', '穩定平衡', '位能井'], modelNote: '一維保守力模型，K=E−U≥0。單井、位能丘及雙井皆用解析公式；E=U 且斜率非零才是一般轉折點，極值處可能為靜止平衡或漸近邊界。粗線是允許的位置集合，不代表粒子可跨越中間禁區。只顯示指定位置範圍。', suppressCommonLabel: true, parametric: potentialParametric });

    function errorBarRows(item) {
        var p = params('errorBarGraph', item);
        if (p.dataPoints.length) return p.dataPoints.map(function (r) { return r.slice(); });
        var dy = (4 + 12 * Math.min(1, p.level / 1.4)) / (p.height - 28);
        return [0.18, 0.28, 0.43, 0.52, 0.69, 0.77].map(function (y, i) { return [Number((0.12 + i * 0.15).toFixed(2)), y, Number(dy.toFixed(4))]; });
    }
    function leastSquares(rows) {
        var mx = rows.reduce(function (s, r) { return s + r[0]; }, 0) / rows.length;
        var my = rows.reduce(function (s, r) { return s + r[1]; }, 0) / rows.length;
        var numerator = 0; var denominator = 0;
        rows.forEach(function (r) { numerator += (r[0] - mx) * (r[1] - my); denominator += (r[0] - mx) * (r[0] - mx); });
        return { slope: numerator / denominator, x: mx, y: my };
    }
    var errorBarParametric = smart(
        { width: 320, height: 230, level: 1, dataMode: 0, dataPoints: [], dataDomain: null, showFit: 1 },
        [control('width', '圖寬', 170, 450, 1, 'px'), control('height', '圖高', 110, 320, 1, 'px'), control('level', '示範資料誤差棒倍率', 0.2, 1.4, 0.1, ''), choice('dataMode', '資料來源', [{ value: 0, label: '示範資料' }, { value: 1, label: '自訂實驗資料' }]), choice('showFit', '最佳擬合線', [{ value: 0, label: '隱藏（題目）' }, { value: 1, label: '顯示（解答）' }])],
        {
            sanitize: function (source) {
                var p = source || {}; var rows = !library.validateDataRows(p.dataPoints, 'measurement') ? p.dataPoints.map(function (r) { return r.slice(); }) : [];
                return { width: Math.round(clamp(p.width, 170, 450, 320)), height: Math.round(clamp(p.height, 110, 320, 230)), level: clamp(p.level, 0.2, 1.4, 1), dataMode: Number(p.dataMode) === 1 ? 1 : 0, dataPoints: rows, dataDomain: Array.isArray(p.dataDomain) ? p.dataDomain.slice(0, 4) : null, showFit: Number(p.showFit) === 0 ? 0 : 1 };
            },
            getControls: function (item) { return errorBarParametric.controls.filter(function (c) { return c.key !== 'level' || !params('errorBarGraph', item).dataMode; }); },
            bounds: function (item) { var p = params('errorBarGraph', item); return { left: -p.width / 2 - 8, right: p.width / 2 + 8, top: -p.height / 2 - 8, bottom: p.height / 2 + 8 }; }
        }
    );
    add('graphs', 'errorBarGraph', '誤差棒與最佳擬合', 320, 230, function (ctx, item) {
        var initial = params('errorBarGraph', item);
        if (initial.dataMode) {
            var rows = errorBarRows(item); var plot = library.dataPlotState(item, rows, 'measurement', initial.width, initial.height);
            library.drawDataAxes(ctx, item, plot, 'x', 'y');
            if (initial.showFit) {
                var fit = leastSquares(rows); var loX = Math.min.apply(null, rows.map(function (r) { return r[0]; })); var hiX = Math.max.apply(null, rows.map(function (r) { return r[0]; }));
                if (Math.abs(fit.slope) > 1e-12) { var xa = fit.x + (plot.domain[2] - fit.y) / fit.slope; var xb = fit.x + (plot.domain[3] - fit.y) / fit.slope; loX = Math.max(loX, Math.min(xa, xb)); hiX = Math.min(hiX, Math.max(xa, xb)); }
                stroke(ctx, [[plot.x(loX), plot.y(fit.y + fit.slope * (loX - fit.x))], [plot.x(hiX), plot.y(fit.y + fit.slope * (hiX - fit.x))]]);
            }
            rows.forEach(function (r) { var x = plot.x(r[0]); var y = plot.y(r[1]); var top = plot.y(r[1] + r[2]); var bottom = plot.y(r[1] - r[2]); stroke(ctx, [[x, top], [x, bottom]]); stroke(ctx, [[x - 4, top], [x + 4, top]]); stroke(ctx, [[x - 4, bottom], [x + 4, bottom]]); dot(ctx, x, y, 3.5); });
            return;
        }
        var p = params('errorBarGraph', item); var a = graphPackAxes(ctx, p, 'x', 'y'); var w = a.right - a.left; var h = a.bottom - a.top;
        var ys = [0.18, 0.28, 0.43, 0.52, 0.69, 0.77];
        var xs = ys.map(function (_, i) { return 0.12 + i * 0.15; });
        var meanX = xs.reduce(function (sum, x) { return sum + x; }, 0) / xs.length;
        var meanY = ys.reduce(function (sum, y) { return sum + y; }, 0) / ys.length;
        var numerator = 0; var denominator = 0;
        xs.forEach(function (x, i) { numerator += (x - meanX) * (ys[i] - meanY); denominator += (x - meanX) * (x - meanX); });
        var slope = numerator / denominator; var intercept = meanY - slope * meanX;
        if (p.showFit) stroke(ctx, [[a.left + 0.08 * w, a.bottom - (intercept + slope * 0.08) * h], [a.left + 0.96 * w, a.bottom - (intercept + slope * 0.96) * h]]);
        var uncertainty = 4 + 12 * Math.min(1, p.level / 1.4);
        ys.forEach(function (ratio, i) { var x = a.left + w * (0.12 + i * 0.15); var y = a.bottom - h * ratio; stroke(ctx, [[x, y - uncertainty], [x, y + uncertainty]]); stroke(ctx, [[x - 5, y - uncertainty], [x + 5, y - uncertainty]]); stroke(ctx, [[x - 5, y + uncertainty], [x + 5, y + uncertainty]]); dot(ctx, x, y, 3.5); });
    }, { keywords: ['誤差棒', '不確定度', '最佳擬合線', '實驗數據'], modelNote: '可貼上 x、y、dy 三欄數據，dy 為各點的垂直不確定度。擬合使用未加權最小平方法；dy 只控制誤差棒，不作統計權重。可隱藏擬合線供學生作答。', dataEditor: { columns: ['x', 'y', 'dy'], kind: 'measurement', hint: '每行輸入 x, y, dy；dy 為非負的上下不確定度。可直接貼上試算表三欄，最多 32 筆。x、y 的單位可在圖中文字欄補上。', rows: errorBarRows, apply: function (item, rows) { item.params = library.sanitizeParams('errorBarGraph', Object.assign({}, item.params, { dataMode: 1, dataPoints: rows, dataDomain: library.dataDomain(rows, 'measurement') })); } }, suppressCommonLabel: true, parametric: errorBarParametric });

    function kinematicsRows(item) { var p = params('linkedKinematicsGraph', item); return p.dataPoints.length ? p.dataPoints : [[Number((10 * p.transition).toPrecision(8)), 0], [Number((10 * (1 - p.transition)).toPrecision(8)), 1]]; }
    function kinematicsPanelVisible(p, index) { return p.solutionMode === 1 || p.givenGraph === index; }
    function kinematicsInitialCaption(p) {
        if (p.solutionMode || !p.showInitialConditions || p.givenGraph === 0 || p.givenGraph === 3) return '';
        var caption = '初始條件：x(0)=' + graphNumber(p.dataMode ? p.initialPosition : 0) + ' m';
        if (p.givenGraph === 2) caption += '；v(0)=' + graphNumber(p.dataMode ? p.initialVelocity : 0) + ' m/s';
        return caption;
    }
    function drawKinematicsBlankAxes(ctx, plot, xLabel, yLabel) {
        // Blank response axes are independent of the hidden answer's sign/range.
        // Retain only the shared time scale; never derive a vertical tick or
        // control point from the missing curve.
        var a = plot.area; var zero = (a.top + a.bottom) / 2;
        arrow(ctx, a.left, zero, a.right + 4, zero, 5);
        arrow(ctx, a.left, a.bottom, a.left, a.top - 4, 5);
        text(ctx, yLabel, a.left, a.top - 12, 11, 'left');
        text(ctx, xLabel, a.right, a.bottom + 21, 11, 'right');
        text(ctx, '0', a.left - 5, zero, 10, 'right');
        var lastRight = a.left + 4;
        (plot.xTicks || []).forEach(function (t) {
            if (t === 0) return;
            var x = plot.x(t); var label = graphNumber(t); var halfWidth = label.length * 3;
            stroke(ctx, [[x, zero - 3], [x, zero + 3]]);
            if (x - halfWidth >= lastRight + 3) { text(ctx, label, x, zero + 12, 10); lastRight = x + halfWidth; }
        });
        text(ctx, '請作圖', a.right, a.top + 10, 11, 'right');
    }
    function kinematicsPanels(item) {
        var p = params('linkedKinematicsGraph', item); var model = library.integrateAccelerationSegments(kinematicsRows(item), p.initialPosition, p.initialVelocity);
        var panelHeight = (p.height - 24) / 3;
        var ticks = library.dataPlotState(item, model.velocity, 'time', p.width, panelHeight).xTicks;
        return [model.position, model.velocity, model.acceleration].map(function (rows, i) {
            var s = library.dataPlotState({ type: item.type, params: { dataDomain: i === 2 ? p.accelerationDomain : null } }, rows, 'time', p.width, panelHeight);
            s.xTicks = ticks;
            return { rows: rows, plot: s, offset: -p.height / 2 + panelHeight / 2 + i * (panelHeight + 12) };
        });
    }
    var linkedKinematicsParametric = smart(
        { width: 340, height: 330, transition: 0.55, dataMode: 0, dataPoints: [], initialPosition: 0, initialVelocity: 0, accelerationDomain: null, solutionMode: 1, givenGraph: 2, showInitialConditions: 1 },
        [choice('solutionMode', '題目／解答', [{ value: 0, label: '題目（保留題設，其餘留白）' }, { value: 1, label: '解答（顯示三張曲線）' }]), choice('givenGraph', '題目提供哪張圖', [{ value: 0, label: '位置 x–t，補畫 v–t 與 a–t' }, { value: 1, label: '速度 v–t，補畫 x–t 與 a–t' }, { value: 2, label: '加速度 a–t，補畫 x–t 與 v–t' }, { value: 3, label: '三圖皆留白（需另附題幹）' }]), choice('showInitialConditions', '附上必要初始條件', [{ value: 1, label: '自動附上（建議）' }, { value: 0, label: '不附上（由題幹另外提供）' }]), choice('dataMode', '運動模型', [{ value: 0, label: '原有靜止後加速示意' }, { value: 1, label: '分段等加速度（數值連動）' }]), control('initialPosition', '初位置', -1000, 1000, 0.1, 'm'), control('initialVelocity', '初速度', -1000, 1000, 0.1, 'm/s'), control('width', '圖寬', 260, 600, 1, 'px'), control('height', '總高度', 240, 780, 1, 'px'), control('transition', '轉折時間比例', 0.2, 0.8, 0.05, '')],
        {
            bounds: function (item) { var p = params(item.type, item); return graphFrame(item, kinematicsInitialCaption(p) ? 36 : 8); },
            getControls: function (item) {
                var p = params(item.type, item);
                return linkedKinematicsParametric.controls.filter(function (c) {
                    if (c.key === 'givenGraph') return !p.solutionMode;
                    if (c.key === 'showInitialConditions') return !p.solutionMode && (p.givenGraph === 1 || p.givenGraph === 2);
                    return p.dataMode ? c.key !== 'transition' : ['initialPosition', 'initialVelocity'].indexOf(c.key) < 0;
                }).map(function (c) { return c.key === 'height' && p.dataMode ? Object.assign({}, c, { min: 420 }) : c; });
            },
            handles: function (item) {
                var p = params(item.type, item);
                if (!p.dataMode) {
                    if (!p.solutionMode && p.givenGraph === 3) return [];
                    var panelHeight = p.height / 3 - 10; var area = axesGeometry(p.width, panelHeight);
                    var y = p.solutionMode ? 0 : -p.height / 2 + panelHeight / 2 + p.givenGraph * (panelHeight + 10) + area.bottom;
                    return [{ id: 'transition', label: '轉折時間', x: area.left + (p.width - 28) * p.transition, y: y, primary: true }];
                }
                if (!kinematicsPanelVisible(p, 2)) return [];
                var panel = kinematicsPanels(item)[2]; var elapsed = 0;
                return kinematicsRows(item).map(function (r, i) { var t = elapsed + r[0] / 2; elapsed += r[0]; return { id: 'segment-' + i, label: '第 ' + (i + 1) + ' 段加速度', x: panel.plot.x(t), y: panel.offset + panel.plot.y(r[1]), primary: i === 0, readout: 'a=' + graphNumber(r[1]) + ' m/s²' }; });
            },
            update: function (item, id, point) {
                var p = params(item.type, item);
                if (!p.solutionMode && (p.givenGraph === 3 || (p.dataMode && p.givenGraph !== 2))) return null;
                if (!p.dataMode && id === 'transition') { p.transition = (point.x - axesGeometry(p.width, p.height / 3 - 10).left) / (p.width - 28); }
                else if (p.dataMode && id.indexOf('segment-') === 0) {
                    var index = Number(id.slice(8)); if (!p.dataPoints[index]) return null;
                    var panel = kinematicsPanels(item)[2]; p.accelerationDomain = panel.plot.domain;
                    p.dataPoints[index][1] = Number(clamp(panel.plot.valueY(point.y - panel.offset), Math.max(-1000, panel.plot.domain[2]), Math.min(1000, panel.plot.domain[3]), p.dataPoints[index][1]).toPrecision(10));
                } else return null;
                item.params = library.sanitizeParams(item.type, p); return { readout: p.dataMode ? '三圖已依加速度重算' : '轉折比例 ' + item.params.transition };
            }
        }
    );
    var sanitizeLinkedKinematics = linkedKinematicsParametric.sanitize;
    linkedKinematicsParametric.sanitize = function (source) {
        var p = sanitizeLinkedKinematics(source);
        p.dataPoints = !library.validateDataRows(source.dataPoints, 'accelerationSegments') ? source.dataPoints.map(function (r) { return r.slice(); }) : [];
        if (p.dataMode && !p.dataPoints.length) p.dataPoints = [[Number((p.transition * 10).toPrecision(8)), 0], [Number(((1 - p.transition) * 10).toPrecision(8)), 1]];
        if (p.dataMode) p.height = Math.max(420, p.height);
        p.accelerationDomain = Array.isArray(source.accelerationDomain) ? source.accelerationDomain.slice(0, 4) : null;
        return p;
    };
    add('graphs', 'linkedKinematicsGraph', '連動 x–t／v–t／a–t 圖', 340, 330, function (ctx, item) {
        var p = params('linkedKinematicsGraph', item); var panelH = p.height / 3 - 10; var labels = ['x', 'v', 'a'];
        var initialCaption = kinematicsInitialCaption(p);
        if (initialCaption) text(ctx, initialCaption, 0, p.height / 2 + 22, 11);
        if (p.dataMode) {
            kinematicsPanels(item).forEach(function (panel, index) {
                ctx.save(); ctx.translate(0, panel.offset);
                if (kinematicsPanelVisible(p, index)) {
                    library.drawDataAxes(ctx, item, panel.plot, 't (s)', ['x (m)', 'v (m/s)', 'a (m/s²)'][index]);
                    stroke(ctx, panel.rows.map(function (r) { return [panel.plot.x(r[0]), panel.plot.y(r[1])]; }));
                } else drawKinematicsBlankAxes(ctx, panel.plot, 't (s)', ['x (m)', 'v (m/s)', 'a (m/s²)'][index]);
                ctx.restore();
            });
            return;
        }
        for (var panel = 0; panel < 3; panel += 1) {
            ctx.save(); ctx.translate(0, -p.height / 2 + panelH / 2 + panel * (panelH + 10));
            if (!kinematicsPanelVisible(p, panel)) {
                drawKinematicsBlankAxes(ctx, { area: axesGeometry(p.width, panelH) }, 't', ['x (m)', 'v (m/s)', 'a (m/s²)'][panel]); ctx.restore(); continue;
            }
            var a = axes(ctx, p.width, panelH, 't', labels[panel]); var w = a.right - a.left; var h = a.bottom - a.top;
            var zeroY = a.bottom;
            var topY = a.top + 0.18 * h;
            var transitionX = a.left + w * p.transition;
            dashed(ctx, [[transitionX, a.top + 2], [transitionX, a.bottom]]);
            begin(ctx);
            for (var sample = 0; sample <= 120; sample += 1) {
                var time = sample / 120;
                // The legacy view has independent, unnumbered vertical scales.
                // Use each curve's full display height so the parabola is legible.
                // Duplicate the acceleration transition time to draw a true jump.
                var transitionSample = Math.round(p.transition * 120);
                if (panel === 2 && (sample === transitionSample - 1 || sample === transitionSample)) time = p.transition;
                var active = Math.max(0, time - p.transition);
                var progress = active / (1 - p.transition);
                var normalized = panel === 0 ? progress * progress : (panel === 1 ? progress : (sample < transitionSample ? 0 : 1));
                var x = a.left + w * time;
                var y = zeroY - normalized * (zeroY - topY);
                if (!sample) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.stroke();
            text(ctx, 't₀', transitionX, a.bottom + 12, 11);
            text(ctx, ['x：m', 'v：m/s', 'a：m/s²'][panel], a.right, a.top - 10, 10, 'right');
            ctx.restore();
        }
    }, { keywords: ['運動圖', 'x-t圖', 'v-t圖', 'a-t圖', '連動圖'], modelNote: '分段模式從初始條件與各段加速度生成三圖：時間尺度相同，縱軸分別定刻度；加速度跳變時，位置與速度仍連續。題目版只留指定曲線，其他圖隱藏答案刻度和控制點，可由資料表改模型。給 v–t 預設附初位置，給 a–t 附初位置與初速度；關閉條件或三圖留白時，請另補題幹。原有示意模式無定量刻度。JSON 工程仍含答案，給學生請用題目 PNG。', dataEditor: { columns: ['duration', 'a'], kind: 'accelerationSegments', hint: '每行為「該段持續時間（s）, 加速度（m/s²）」；不是累計時刻。可輸入 1～16 段，段長 0.001～1000 s、總時間≤10000 s、|a|≤1000。a=0 表示等速度，不一定靜止。此表是教師的完整模型，題目模式不會刪除答案資料。', rows: kinematicsRows, apply: function (item, rows) { item.params = library.sanitizeParams(item.type, Object.assign({}, item.params, { dataMode: 1, dataPoints: rows, accelerationDomain: null })); } }, suppressCommonLabel: true, parametric: linkedKinematicsParametric });

    /* Modern and nuclear physics. */
    var photoelectricApparatusParametric = smart(
        { width: 380, height: 230, setting: 1, voltageMode: 1, voltage: 1, frequency: 10, workFunction: 2, solutionMode: 1 },
        [
            control('width', '裝置寬度', 300, 540, 1, 'px'),
            control('height', '裝置高度', 130, 320, 1, 'px'),
            control('frequency', '入射頻率', 1, 30, 0.01, '×10¹⁴ Hz'),
            control('workFunction', '金屬逸出功', 0.1, 6, 0.01, 'eV'),
            control('setting', '入射光強（0 為關光）', 0, 2, 0.1, '倍'),
            choice('voltageMode', '外加電壓', [
                { value: 1, label: '反向電壓（K 正、A 負）' },
                { value: -1, label: '加速電壓（K 負、A 正）' }
            ]),
            control('voltage', '外加電壓大小', 0, 20, 0.01, 'V'),
            choice('solutionMode', '題目／解答', [{ value: 0, label: '題目（隱藏電子與判斷結果）' }, { value: 1, label: '解答（電子與截止判斷）' }])
        ],
        { bounds: function (item) { var p = params('photoelectricApparatus', item); return { left: -p.width / 2 - 16, top: -p.height / 2 - 30, right: p.width / 2 + 16, bottom: p.height / 2 + 100 }; } }
    );

    var sanitizePhotoelectric = photoelectricApparatusParametric.sanitize;
    photoelectricApparatusParametric.getControls = function () { return photoelectricApparatusParametric.controls.map(function (c) { return ['frequency', 'workFunction', 'voltage'].indexOf(c.key) >= 0 ? Object.assign({}, c, { continuous: true }) : c; }); };
    photoelectricApparatusParametric.sanitize = function (source) {
        var p = sanitizePhotoelectric(source);
        p.frequency = clamp(source.frequency, 1, 30, 10); p.workFunction = clamp(source.workFunction, 0.1, 6, 2); p.voltage = clamp(source.voltage, 0, 20, 1);
        return p;
    };
    function photoelectricState(p) {
        var photonEnergy = 0.4135667696 * p.frequency; var excess = photonEnergy - p.workFunction;
        var illuminated = p.setting > 0; var emitting = illuminated && excess >= -1e-8;
        var threshold = Math.abs(excess) <= 1e-8;
        var extracted = threshold && p.voltageMode === -1 && p.voltage > 0;
        var moving = emitting && (!threshold || extracted);
        var stopped = moving && p.voltageMode === 1 && p.voltage >= excess - 1e-8;
        return { photonEnergy: photonEnergy, kinetic: threshold ? 0 : Math.max(0, excess), emitting: emitting, moving: moving, stopped: stopped,
            status: !illuminated ? '關光：無光電子' : excess < -1e-8 ? '頻率低於臨界：不逸出' : threshold ? (extracted ? '臨界頻率：加速電場抽取零初速電子' : '臨界頻率：最大初動能為零') : stopped ? '已達截止條件：光電流為零' : '可收集光電子（非定量電流）' };
    }

    add('modern', 'photoelectricApparatus', '光電效應實驗裝置', 380, 230, function (ctx, item) {
        var p = params('photoelectricApparatus', item); var chamberW = p.width * 0.5; var chamberH = p.height * 0.56;
        ctx.strokeRect(-chamberW / 2, -chamberH / 2, chamberW, chamberH);
        stroke(ctx, [[-chamberW * 0.28, -chamberH * 0.34], [-chamberW * 0.28, chamberH * 0.34]]); text(ctx, 'K', -chamberW * 0.28, -chamberH / 2 - 12, 15);
        stroke(ctx, [[chamberW * 0.28, -chamberH * 0.34], [chamberW * 0.28, chamberH * 0.34]]); text(ctx, 'A', chamberW * 0.28, -chamberH / 2 - 12, 15);
        var state = photoelectricState(p); var rayCount = p.setting > 0 ? Math.min(Math.floor(chamberH * 0.54 / 10) + 1, Math.max(1, Math.round(2 + p.setting * 3))) : 0;
        for (var ray = 0; ray < rayCount; ray += 1) { var rayRatio = rayCount === 1 ? 0.5 : ray / (rayCount - 1); arrow(ctx, -p.width / 2, -chamberH * 0.42 + rayRatio * chamberH * 0.62, -chamberW * 0.28, -chamberH * 0.27 + rayRatio * chamberH * 0.54, 7); }
        text(ctx, 'ν', -p.width / 2 + 30, -chamberH / 2 - 22, 16);
        var electronCount = p.solutionMode && state.moving ? Math.min(Math.floor(chamberH * 0.52 / 12) + 1, Math.max(1, Math.round(1 + p.setting * 3))) : 0;
        for (var e = 0; e < electronCount; e += 1) {
            var eRatio = electronCount === 1 ? 0.5 : e / (electronCount - 1); var electronY = -chamberH * 0.26 + eRatio * chamberH * 0.52;
            var start = -chamberW * 0.28; var end = chamberW * 0.28;
            if (state.stopped) {
                // Outgoing/return tracks are offset for readability, not transverse acceleration.
                end = start + chamberW * 0.56 * Math.min(1, state.kinetic / p.voltage);
                stroke(ctx, [[start, electronY], [end, electronY], [end, electronY + 7]]);
                if (end - start > 10) arrow(ctx, end, electronY + 7, start, electronY + 7, 4);
            } else arrow(ctx, start, electronY, end, electronY, 6);
        }
        var circuitY = p.height / 2;
        var cathodeX = -chamberW * 0.28; var anodeX = chamberW * 0.28;
        stroke(ctx, [[cathodeX, chamberH * 0.34], [cathodeX, circuitY], [-45, circuitY]]);
        circle(ctx, -25, circuitY, 20, true); text(ctx, 'μA', -25, circuitY, 12);
        stroke(ctx, [[-5, circuitY], [38, circuitY]]);
        var leftHalfPlate = p.voltageMode === 1 ? 15 : 9; var rightHalfPlate = p.voltageMode === 1 ? 9 : 15;
        stroke(ctx, [[38, circuitY - leftHalfPlate], [38, circuitY + leftHalfPlate]]); stroke(ctx, [[54, circuitY - rightHalfPlate], [54, circuitY + rightHalfPlate]]);
        arrow(ctx, 26, circuitY + 22, 62, circuitY - 20, 6);
        stroke(ctx, [[54, circuitY], [anodeX, circuitY], [anodeX, chamberH * 0.34]]);
        if (p.voltage > 0) { text(ctx, p.voltageMode === 1 ? '+' : '−', 37, circuitY - 25, 12); text(ctx, p.voltageMode === 1 ? '−' : '+', 55, circuitY - 25, 12); }
        text(ctx, (p.voltageMode === 1 ? '反向' : '加速') + '電壓 ' + graphNumber(p.voltage) + ' V', 45, circuitY + 29, 11);
        text(ctx, 'ν=' + graphNumber(p.frequency) + '×10¹⁴ Hz；φ=' + graphNumber(p.workFunction) + ' eV', 0, circuitY + 50, 12);
        if (p.solutionMode) {
            text(ctx, state.status, 0, circuitY + 69, 12);
            if (state.emitting) text(ctx, '最大初動能 ' + graphNumber(state.kinetic) + ' eV；截止電壓 ' + graphNumber(state.kinetic) + ' V', 0, circuitY + 88, 11);
        }
    }, { keywords: ['光電效應', '截止電壓', '遏止電壓', '光電子', '逸出功'], modelNote: '單光子模型：最大初動能=hν−φ，光強只改示意數量，不改截止電壓。反向電壓不一定已截止；只有 eV≥最大初動能才截止。電子線代表最快電子的示意，折回雙線的垂直間隔只為辨識，不是實際二維軌跡；不求電流大小。臨界頻率時，加速電場可抽取零初速電子；不含表面勢壘降低或熱效應。題目版隱藏電子及計算結果。', suppressCommonLabel: true, parametric: photoelectricApparatusParametric });

    var photoelectricGraphParametric = smart(
        { width: 310, height: 220, threshold: 0.27 },
        [control('width', '圖寬', 180, 440, 1, 'px'), control('height', '圖高', 120, 320, 1, 'px'), control('threshold', '臨界頻率 ν₀ 位置', 0.1, 0.58, 0.01, '')],
        {
            bounds: function (item) { var p = params('photoelectricGraph', item); return { left: -p.width / 2 - 8, top: -p.height / 2 - 8, right: p.width / 2 + 8, bottom: p.height / 2 + 8 }; },
            handles: function (item) { var p = params('photoelectricGraph', item); var a = axesGeometry(p.width, p.height); var x = a.left + (a.right - a.left) * p.threshold; return [{ id: 'threshold', label: '臨界頻率', x: x, y: a.bottom, primary: true, readout: 'ν₀ ' + p.threshold.toFixed(2) }]; },
            update: function (item, id, point) {
                if (id !== 'threshold') return null;
                var p = params('photoelectricGraph', item); var a = axesGeometry(p.width, p.height);
                p.threshold = (point.x - a.left) / Math.max(1, a.right - a.left);
                item.params = library.sanitizeParams('photoelectricGraph', p);
                return { readout: 'ν₀ ' + item.params.threshold.toFixed(2) };
            }
        }
    );
    add('modern', 'photoelectricGraph', '光電效應 Kmax–ν 圖', 310, 220, function (ctx, item) {
        var p = params('photoelectricGraph', item); var a = axes(ctx, p.width, p.height, 'ν', 'Kₘₐₓ'); var w = a.right - a.left; var h = a.bottom - a.top; var threshold = a.left + w * 0.27;
        threshold = a.left + w * p.threshold;
        var fixedRisePerWidth = 1.12;
        var endX = Math.min(a.right - 0.05 * w, threshold + h * 0.86 / fixedRisePerWidth);
        var endY = a.bottom - (endX - threshold) * fixedRisePerWidth;
        stroke(ctx, [[threshold, a.bottom], [endX, endY]]); dot(ctx, threshold, a.bottom, 3); text(ctx, 'ν₀', threshold, a.bottom + 14, 13); text(ctx, '斜率固定為 h', a.right - 0.24 * w, a.top + 20, 13);
    }, { keywords: ['光電效應圖', 'Kmax頻率圖', '截止頻率', '普朗克常數'], suppressCommonLabel: true, parametric: photoelectricGraphParametric });

    function energyLevelState(item) {
        var p = params('energyLevelDiagram', item); var bottom = p.height / 2; var ionizationY = -p.height / 2; var ionizationGap = 22;
        var levelSpan = p.height - ionizationGap; var gapCount = Math.max(1, p.levels - 1); var minimumGap = Math.min(16, levelSpan / gapCount * 0.65);
        var weightTotal = 1 - 1 / (p.levels * p.levels); var flexibleHeight = Math.max(0, levelSpan - minimumGap * gapCount);
        var levelY = [bottom]; var cursorY = bottom;
        for (var n = 1; n < p.levels; n += 1) { var energyGap = 1 / (n * n) - 1 / ((n + 1) * (n + 1)); cursorY -= minimumGap + flexibleHeight * energyGap / weightTotal; levelY.push(cursorY); }
        return { p: p, bottom: bottom, ionizationY: ionizationY, levelY: levelY, rows: p.transitionMode ? p.transitions : [[p.fromLevel, p.toLevel]] };
    }
    var energyLevelParametric = smart(
        { width: 280, height: 280, levels: 5, fromLevel: 4, toLevel: 2, transition: 3, transitionMode: 0, transitions: [], solutionMode: 1, showEnergies: 1 },
        [choice('transitionMode', '躍遷設定', [{ value: 0, label: '單一躍遷' }, { value: 1, label: '多組躍遷（在資料表編輯）' }]), control('width', '圖表寬度', 240, 480, 1, 'px'), control('height', '能階圖高度', 240, 460, 1, 'px'), control('levels', '能階數量', 3, 7, 1, '層'), control('fromLevel', '起始能階', 1, 7, 1, ''), control('toLevel', '終止能階（0 為游離）', 0, 7, 1, ''), choice('solutionMode', '題目／解答', [{ value: 0, label: '題目（隱藏躍遷箭頭與光子答案）' }, { value: 1, label: '解答（顯示躍遷與光子能量）' }]), choice('showEnergies', '能階數值（題設）', [{ value: 0, label: '隱藏 eV 數值' }, { value: 1, label: '顯示 eV 數值' }])],
        {
            sanitize: function (source) {
                var incoming = source && typeof source === 'object' ? source : {}; var levels = Math.round(clamp(incoming.levels, 3, 7, 5));
                var legacyFrom = Math.min(levels, Math.max(2, Math.round(number(incoming.transition, 3)) + 1));
                var fromLevel = Math.round(clamp(incoming.fromLevel, 1, levels, legacyFrom));
                var toLevel = Math.round(clamp(incoming.toLevel, 0, levels, 2));
                var rows = library.validateDataRows(incoming.transitions, 'transitions') ? [[4, 2], [2, 0]] : incoming.transitions.map(function (r) { return r.slice(); });
                var mode = incoming.transitionMode === 1 ? 1 : 0;
                if (mode) levels = Math.max(levels, Math.max.apply(null, rows.flat()));
                return { width: Math.round(clamp(incoming.width, 240, 480, 280)), height: Math.round(clamp(incoming.height, 240, 460, 280)), levels: levels, fromLevel: fromLevel, toLevel: toLevel, transition: legacyFrom - 1, transitionMode: mode, transitions: rows, solutionMode: incoming.solutionMode === 0 ? 0 : 1, showEnergies: incoming.showEnergies === 0 ? 0 : 1 };
            },
            getControls: function (item) { var p = params(item.type, item); return energyLevelParametric.controls.filter(function (c) { return !p.transitionMode || ['fromLevel', 'toLevel'].indexOf(c.key) < 0; }).map(function (c) { return ['fromLevel', 'toLevel'].indexOf(c.key) >= 0 ? Object.assign({}, c, { max: p.levels }) : c; }); },
            bounds: function (item) { var s = energyLevelState(item); return { left: -s.p.width / 2 - 66, top: -s.p.height / 2 - 32, right: s.p.width / 2 + 76, bottom: s.p.height / 2 + 34 + 20 * s.rows.length }; },
            handles: function (item) {
                var s = energyLevelState(item); var handles = [];
                s.rows.forEach(function (r, i) { var x = -s.p.width * 0.36 + s.p.width * 0.72 * (i + 1) / (s.rows.length + 1); handles.push({ id: 'from-' + i, label: String.fromCharCode(65 + i) + ' 起點', x: x, y: s.levelY[r[0] - 1], primary: i === 0 }, { id: 'to-' + i, label: String.fromCharCode(65 + i) + ' 終點', x: x, y: r[1] ? s.levelY[r[1] - 1] : s.ionizationY }); });
                return handles;
            },
            update: function (item, id, point) {
                var match = /^(from|to)-(\d+)$/.exec(id); if (!match) return null; var s = energyLevelState(item); var index = Number(match[2]); if (!s.rows[index]) return null;
                var ys = s.levelY.map(function (y, i) { return { y: y, n: i + 1 }; }); if (match[1] === 'to') ys.push({ y: s.ionizationY, n: 0 });
                var nearest = ys.reduce(function (a, b) { return Math.abs(b.y - point.y) < Math.abs(a.y - point.y) ? b : a; });
                var column = match[1] === 'from' ? 0 : 1;
                if (s.p.transitionMode) { if (nearest.n === s.rows[index][1 - column]) return { readout: '同一能階沒有躍遷' }; s.p.transitions[index][column] = nearest.n; }
                else s.p[column === 0 ? 'fromLevel' : 'toLevel'] = nearest.n;
                item.params = library.sanitizeParams(item.type, s.p); return { readout: nearest.n ? 'n=' + nearest.n : '游離 n=∞' };
            }
        }
    );
    add('modern', 'energyLevelDiagram', '氫原子能階與躍遷', 410, 360, function (ctx, item) {
        var state = energyLevelState(item); var p = state.p; var left = -p.width / 2; var right = p.width / 2; var bottom = state.bottom; var ionizationY = state.ionizationY; var levelY = state.levelY;
        for (var index = 0; index < p.levels; index += 1) {
            var principal = index + 1; var y = levelY[index];
            stroke(ctx, [[left, y], [right, y]]);
            text(ctx, 'n = ' + principal, left - 12, y, 12, 'right');
            if (p.showEnergies) text(ctx, (-13.6 / (principal * principal)).toFixed(principal === 1 ? 1 : 2) + ' eV', right + 12, y, 12, 'left');
        }
        dashed(ctx, [[left, ionizationY], [right, ionizationY]]);
        text(ctx, 'n = ∞', left - 12, ionizationY, 12, 'right');
        if (p.showEnergies) text(ctx, '0 eV', right + 12, ionizationY, 12, 'left');
        text(ctx, '氫原子能階（間距示意，非等比例）', 0, ionizationY - 20, 12);
        state.rows.forEach(function (r, i) {
            var x = -p.width * 0.36 + p.width * 0.72 * (i + 1) / (state.rows.length + 1); var letter = String.fromCharCode(65 + i);
            var fromY = levelY[r[0] - 1]; var toY = r[1] ? levelY[r[1] - 1] : ionizationY;
            var delta = 13.6 / (r[0] * r[0]) - (r[1] ? 13.6 / (r[1] * r[1]) : 0);
            if (p.solutionMode && fromY !== toY) { arrow(ctx, x, fromY, x, toY, 6); text(ctx, letter, x + 7, (fromY + toY) / 2, 12, 'left'); }
            var caption = letter + ': ' + r[0] + '→' + (r[1] || '∞');
            if (p.solutionMode) caption += delta === 0 ? '  無躍遷' : (delta > 0 ? '  吸收 ' : '  放出 ') + graphNumber(Math.abs(delta)) + ' eV';
            text(ctx, caption, 0, bottom + 24 + i * 20, 12);
        });
    }, { keywords: ['氫原子', '能階', '躍遷', '光子', '原子光譜', '游離能'], modelNote: '採 E(n)=−13.6/n² eV 的氫原子近似，為避免高能階擠字，垂直間距不是比例尺。終點 0 表示剛好游離到零動能；單一模式相同起終點表示無躍遷。多組資料是各自獨立的躍遷，不假定同一電子依序經過。題目版隱藏箭頭與光子能量，能階 eV 題設可另外關閉。', dataEditor: { columns: ['from', 'to'], kind: 'transitions', hint: '每行起始、終止能階，最多 6 組；起點 1～7，終點 1～7 或 0（游離），兩者須不同。套用後切成多組模式並自動增加顯示能階。可拖每組箭頭端點，也可用此表精確輸入。', rows: function (item) { return energyLevelState(item).rows; }, apply: function (item, rows) { item.params = library.sanitizeParams(item.type, Object.assign({}, item.params, { transitionMode: 1, transitions: rows })); } }, suppressCommonLabel: true, parametric: energyLevelParametric });

    function hydrogenWavelength(lower, upper) { return 1e9 / (1.097e7 * (1 / (lower * lower) - (upper ? 1 / (upper * upper) : 0))); }
    function spectrumState(item) {
        var p = params('hydrogenSpectrum', item); var limit = hydrogenWavelength(p.series, 0); var longest = hydrogenWavelength(p.series, p.series + 1); var span = longest - limit;
        var lo = Math.max(0, limit - span * 0.06); var hi = longest + span * 0.08;
        var left = -p.width / 2 + 16; var right = p.width / 2 - 16;
        return { p: p, limit: limit, lo: lo, hi: hi, x: function (wavelength) { return left + (right - left) * (wavelength - lo) / (hi - lo); } };
    }
    var spectrumParametric = smart(
        { width: 360, height: 120, series: 2, upper: 9, selected: 3, spectrumMode: 0, showValues: 1 },
        [choice('series', '光譜系列／下能階', [{ value: 1, label: '萊曼系 n=1（紫外）' }, { value: 2, label: '巴耳末系 n=2' }, { value: 3, label: '帕申系 n=3（紅外）' }]), choice('spectrumMode', '光譜形式', [{ value: 0, label: '發射線（黑白示意）' }, { value: 1, label: '吸收線（黑白示意）' }]), control('upper', '最高上能階', 2, 12, 1, ''), control('selected', '選取譜線的上能階', 2, 12, 1, ''), choice('showValues', '波長答案', [{ value: 0, label: '題目（隱藏波長數值）' }, { value: 1, label: '解答（標示選取譜線與收斂波長）' }]), control('width', '光譜寬度', 280, 580, 1, 'px'), control('height', '線長', 80, 210, 1, 'px')],
        {
            bounds: function (item) { var p = params(item.type, item); return { left: -p.width / 2 - 8, top: -p.height / 2 - 32, right: p.width / 2 + 8, bottom: p.height / 2 + 76 }; },
            getControls: function (item) { var p = params(item.type, item); return spectrumParametric.controls.map(function (c) { return c.key === 'upper' ? Object.assign({}, c, { min: p.series + 1 }) : c.key === 'selected' ? Object.assign({}, c, { min: p.series + 1, max: p.upper }) : c; }); },
            handles: function (item) { var s = spectrumState(item); return [{ id: 'line', label: '選取譜線', x: s.x(hydrogenWavelength(s.p.series, s.p.selected)), y: 0, primary: true, readout: 'n=' + s.p.selected }]; },
            update: function (item, id, point) { if (id !== 'line') return null; var s = spectrumState(item); var nearest = s.p.series + 1; for (var n = nearest + 1; n <= s.p.upper; n += 1) if (Math.abs(s.x(hydrogenWavelength(s.p.series, n)) - point.x) < Math.abs(s.x(hydrogenWavelength(s.p.series, nearest)) - point.x)) nearest = n; s.p.selected = nearest; item.params = library.sanitizeParams(item.type, s.p); return { readout: 'n=' + nearest }; }
        }
    );
    var sanitizeSpectrum = spectrumParametric.sanitize;
    spectrumParametric.sanitize = function (source) { var p = sanitizeSpectrum(source); p.upper = Math.max(p.series + 1, p.upper); p.selected = Math.max(p.series + 1, Math.min(p.upper, p.selected)); return p; };
    add('modern', 'hydrogenSpectrum', '氫原子線光譜', 320, 170, function (ctx, item) {
        var s = spectrumState(item); var p = s.p; var top = -p.height / 2; var bottom = p.height / 2; var selectedX = s.x(hydrogenWavelength(p.series, p.selected));
        ctx.strokeRect(-p.width / 2, top, p.width, p.height);
        var ink = ctx.strokeStyle; ctx.save();
        if (!p.spectrumMode) { ctx.fillStyle = ink; ctx.fillRect(-p.width / 2, top, p.width, p.height); ctx.strokeStyle = '#ffffff'; }
        for (var n = p.series + 1; n <= p.upper; n += 1) { var x = s.x(hydrogenWavelength(p.series, n)); stroke(ctx, [[x, top + 8], [x, bottom - 8]]); }
        dashed(ctx, [[s.x(s.limit), top + 8], [s.x(s.limit), bottom - 8]]);
        ctx.restore(); ctx.strokeStyle = ink;
        dashed(ctx, [[s.x(s.limit), top - 4], [s.x(s.limit), top]]);
        arrow(ctx, selectedX, bottom + 18, selectedX, bottom + 2, 5);
        text(ctx, ['','萊曼系','巴耳末系','帕申系'][p.series] + (p.spectrumMode ? '吸收線' : '發射線') + '；λ →', 0, top - 20, 12);
        text(ctx, '選取：' + (p.spectrumMode ? p.series + '→' + p.selected : p.selected + '→' + p.series) + (p.showValues ? '；λ≈' + hydrogenWavelength(p.series, p.selected).toFixed(1) + ' nm' : ''), 0, bottom + 34, 12);
        text(ctx, '左側虛線：系列收斂極限' + (p.showValues ? ' ≈' + s.limit.toFixed(1) + ' nm' : ''), 0, bottom + 54, 11);
        text(ctx, '線的明暗與粗細不代表相對強度', 0, bottom + 70, 10);
    }, { keywords: ['氫光譜', '巴耳末系', '萊曼系', '帕申系', '線光譜'], modelNote: '以 R=1.097×10⁷ m⁻¹ 計算近似真空波長，不是高精度空氣波長資料。橫向位置按波長比例；顯示有限上能階，另畫真正系列收斂極限，不把最後一條線當極限。選取藍點只選既有譜線，不任意改波長。吸收模式假設下能階有足夠原子，巴耳末／帕申吸收不代表冷氫氣必然呈現的光譜；不模擬強度或線寬。', suppressCommonLabel: true, parametric: spectrumParametric });

    var crtParametric = smart(
        { width: 360, height: 170, deflection: 48, platePolarity: 1 },
        [control('width', '管長', 240, 500, 1, 'px'), control('height', '管高', 120, 250, 1, 'px'), control('deflection', '偏轉量', 0, 85, 1, 'px'), choice('platePolarity', '極板極性', [{ value: 1, label: '上正、下負' }, { value: -1, label: '上負、下正' }])],
        {
            sanitize: function (source) {
                var incoming = source && typeof source === 'object' ? source : {};
                var legacyDeflection = number(incoming.deflection, -48);
                var explicitPolarity = Number(incoming.platePolarity);
                var polarity = explicitPolarity === -1 || explicitPolarity === 1 ? explicitPolarity : (legacyDeflection <= 0 ? 1 : -1);
                var height = Math.round(clamp(incoming.height, 120, 250, 170));
                return { width: Math.round(clamp(incoming.width, 240, 500, 360)), height: height, deflection: Math.round(clamp(Math.abs(legacyDeflection), 0, Math.min(85, height / 2 - 18), 48)), platePolarity: polarity };
            },
            bounds: function (item) { var p = params('cathodeRayTube', item); return { left: -p.width / 2 - 12, top: -p.height / 2 - 12, right: p.width / 2 + 12, bottom: p.height / 2 + 12 }; },
            handles: function (item) { var p = params('cathodeRayTube', item); var beamY = -p.platePolarity * p.deflection; return [{ id: 'beam', label: '電子束', x: p.width / 2 - 15, y: beamY, primary: true, readout: 'Δy ' + Math.round(beamY) }]; },
            update: function (item, id, point) {
                if (id !== 'beam') return null; var p = params('cathodeRayTube', item);
                p.deflection = Math.max(0, -p.platePolarity * point.y);
                item.params = library.sanitizeParams('cathodeRayTube', p);
                return { readout: 'Δy ' + Math.round(-item.params.platePolarity * item.params.deflection) + ' px' };
            }
        }
    );
    add('modern', 'cathodeRayTube', '陰極射線管', 400, 210, function (ctx, item) {
        var p = params('cathodeRayTube', item); var left = -p.width / 2; var right = p.width / 2; var top = -p.height / 2; var bottom = p.height / 2;
        begin(ctx); ctx.moveTo(left, top * 0.55); ctx.lineTo(left + p.width * 0.35, top); ctx.lineTo(right, top); ctx.lineTo(right, bottom); ctx.lineTo(left + p.width * 0.35, bottom); ctx.lineTo(left, bottom * 0.55); ctx.closePath(); ctx.stroke();
        stroke(ctx, [[left + 24, -30], [left + 24, 30]]); text(ctx, 'K', left + 10, 0, 14);
        var plateLeft = -p.width * 0.15; var plateRight = p.width * 0.07; var plateGap = Math.min(52, p.height * 0.28);
        stroke(ctx, [[plateLeft, -plateGap], [plateRight, -plateGap]]); stroke(ctx, [[plateLeft, plateGap], [plateRight, plateGap]]); text(ctx, p.platePolarity === 1 ? '+' : '−', (plateLeft + plateRight) / 2, -plateGap - 13, 16); text(ctx, p.platePolarity === 1 ? '−' : '+', (plateLeft + plateRight) / 2, plateGap + 13, 16);
        var beamY = -p.platePolarity * p.deflection;
        var screenX = right - 15; var fieldLength = plateRight - plateLeft; var tailLength = screenX - plateRight;
        var exitY = beamY / (1 + 2 * tailLength / fieldLength);
        stroke(ctx, [[left + 26, 0], [plateLeft, 0]]);
        begin(ctx); ctx.moveTo(plateLeft, 0); ctx.quadraticCurveTo((plateLeft + plateRight) / 2, 0, plateRight, exitY); ctx.stroke();
        arrow(ctx, plateRight, exitY, screenX, beamY, 7);
        stroke(ctx, [[right - 6, top + 8], [right - 6, bottom - 8]]); text(ctx, '螢光屏', right - 35, bottom - 15, 12);
    }, { keywords: ['陰極射線管', '電子束', '湯姆生', '偏轉'], suppressCommonLabel: true, parametric: crtParametric });

    var millikanParametric = smart(
        { separation: 125, dropY: 0, fieldArrow: 55, chargeSign: -1, platePolarity: 1, electricRatio: 1, forceDisplay: 1 },
        [choice('chargeSign', '油滴電荷', [{ value: -1, label: '負電' }, { value: 1, label: '正電' }]), choice('platePolarity', '極板電場', [{ value: 1, label: '上正下負' }, { value: -1, label: '上負下正' }, { value: 0, label: '關閉電場' }]), choice('forceDisplay', '受力標示', [{ value: 0, label: '全部隱藏（題目）' }, { value: 1, label: '重力與電力' }, { value: 2, label: '只顯示重力' }, { value: 3, label: '只顯示電力' }]), control('electricRatio', '電力／重力大小比', 0, 2, 0.1, ''), control('separation', '極板間距', 75, 220, 1, 'px'), control('dropY', '油滴位置', -70, 70, 1, 'px'), control('fieldArrow', '重力箭頭長度', 30, 95, 1, 'px')],
        {
            sanitize: function (source) { var p = source || {}; var separation = Math.round(clamp(p.separation, 75, 220, 125)); var limit = Math.min(70, separation / 2 - 13); return { separation: separation, dropY: clamp(p.dropY, -limit, limit, 0), fieldArrow: Math.round(clamp(p.fieldArrow, 30, 95, 55)), chargeSign: p.chargeSign === 1 ? 1 : -1, platePolarity: p.platePolarity === 0 ? 0 : p.platePolarity === -1 ? -1 : 1, electricRatio: Math.round(clamp(p.electricRatio, 0, 2, 1) * 10) / 10, forceDisplay: Math.round(clamp(p.forceDisplay, 0, 3, 1)) }; },
            getControls: function (item) { var p = params('millikanOilDrop', item); return millikanParametric.controls.filter(function (c) { return (c.key !== 'electricRatio' || p.platePolarity !== 0) && (c.key !== 'fieldArrow' || p.forceDisplay !== 0); }); },
            bounds: function (item) { var p = params('millikanOilDrop', item); var fy = p.chargeSign * p.platePolarity * p.fieldArrow * p.electricRatio; var showE = p.forceDisplay === 1 || p.forceDisplay === 3; var showG = p.forceDisplay === 1 || p.forceDisplay === 2; return { left: -174, right: 148, top: Math.min(-134, -p.separation / 2 - 25, p.dropY + (showE ? fy : 0) - 20), bottom: Math.max(p.separation / 2 + 25, p.dropY + (showE ? fy : 0) + 20, p.dropY + (showG ? p.fieldArrow : 0) + 16) }; },
            handles: function (item) { var p = params('millikanOilDrop', item); return [{ id: 'drop', label: '油滴', x: 0, y: p.dropY, primary: true, readout: 'y ' + p.dropY }]; },
            update: function (item, id, point) { if (id !== 'drop') return null; var p = params('millikanOilDrop', item); p.dropY = clamp(point.y, -70, 70, p.dropY); item.params = library.sanitizeParams('millikanOilDrop', p); return { readout: 'y ' + Math.round(item.params.dropY) }; }
        }
    );
    add('modern', 'millikanOilDrop', '密立根油滴實驗', 310, 270, function (ctx, item) {
        var p = params('millikanOilDrop', item); var top = -p.separation / 2; var bottom = p.separation / 2;
        ctx.lineWidth *= 2; stroke(ctx, [[-125, top], [125, top]]); stroke(ctx, [[-125, bottom], [125, bottom]]); ctx.lineWidth /= 2;
        if (p.platePolarity) {
            // Signs stay away from the force diagram, even near the plates.
            [-95, -70, 70, 95].forEach(function (x) { text(ctx, p.platePolarity > 0 ? '+' : '−', x, top - 15, 14); text(ctx, p.platePolarity > 0 ? '−' : '+', x, bottom + 15, 14); });
        }
        circle(ctx, 0, p.dropY, 9, true); text(ctx, p.chargeSign > 0 ? '+q' : '−q', 24, p.dropY, 13);
        var forceY = p.chargeSign * p.platePolarity * p.fieldArrow * p.electricRatio;
        var showE = (p.forceDisplay === 1 || p.forceDisplay === 3) && Math.abs(forceY) > 0;
        var showG = p.forceDisplay === 1 || p.forceDisplay === 2;
        var offset = showE && showG && forceY > 0 ? 7 : 0;
        if (showE) { arrow(ctx, -offset, p.dropY, -offset, p.dropY + forceY, Math.min(8, Math.abs(forceY) * 0.4)); text(ctx, '|q|E', -offset - 10, p.dropY + forceY, 14, 'right'); }
        if (showG) { arrow(ctx, offset, p.dropY, offset, p.dropY + p.fieldArrow, 8); text(ctx, 'mg', offset + 18, p.dropY + p.fieldArrow - 2, 14); }
        stroke(ctx, [[-145, -90], [-105, -58]]); circle(ctx, -154, -99, 12, true); text(ctx, '噴霧', -155, -122, 12);
    }, { keywords: ['密立根油滴', '基本電荷', '油滴實驗'], modelNote: '可切換電荷、極板極性、關閉電場及受力標示；電力方向由電荷與電場共同決定。電力／重力比控制箭長比，只有電力向上且比值為 1 時兩力平衡；忽略浮力與阻力，未表示油滴速度。', suppressCommonLabel: true, parametric: millikanParametric });

    function rutherfordState(item) {
        var p = params('rutherfordScattering', item); var selectedIndex = Math.floor(p.particles / 2);
        var beams = []; var angle = -p.scatterSide * p.spread * DEG;
        for (var i = 0; i < p.particles; i += 1) {
            var y = -64 + 128 * i / (p.particles - 1);
            var selected = i === selectedIndex;
            // One selected ray and (for >=5 beams) one small-angle example;
            // the remaining rays are straight. Counts are not probabilities.
            var dx = selected ? Math.cos(angle) * 150 : 130;
            var dy = selected ? Math.sin(angle) * 150 : (p.particles >= 5 && i === 0 ? -22 : 0);
            beams.push({ start: { x: p.foilX, y: y }, end: { x: p.foilX + dx, y: y + dy }, selected: selected });
        }
        var beam = beams[selectedIndex];
        return { p: p, beams: beams, selected: beam, angle: angle, footerY: Math.max(146, beam.end.y + 38) };
    }
    var rutherfordParametric = smart(
        { particles: 9, spread: 58, foilX: 20, scatterSide: 1, showOutgoing: 1, showAngle: 0 },
        [control('particles', '代表性入射路徑數（非統計比例）', 4, 15, 1, '條'), control('spread', '選定束偏折角（方向示意）', 0, 175, 1, '°'), choice('scatterSide', '選定束偏折側', [{ value: 1, label: '向上' }, { value: -1, label: '向下' }]), control('foilX', '金箔位置', -30, 60, 1, 'px'), choice('showOutgoing', '散射結果', [{ value: 0, label: '隱藏（保留入射束與金箔）' }, { value: 1, label: '顯示' }]), choice('showAngle', '選定束角度標示', [{ value: 0, label: '隱藏' }, { value: 1, label: '顯示' }])],
        {
            getControls: function (item) { var p = params('rutherfordScattering', item); return rutherfordParametric.controls.filter(function (c) { return p.showOutgoing || ['spread', 'scatterSide', 'showAngle'].indexOf(c.key) < 0; }); },
            bounds: function (item) {
                var s = rutherfordState(item); var p = s.p;
                if (!p.showOutgoing) return { left: -210, top: -110, right: p.foilX + 25, bottom: 138 };
                var endpoints = s.beams.map(function (b) { return b.end; });
                return { left: Math.min(-210, s.selected.end.x - 35, p.foilX - 120), top: Math.min(p.showAngle ? -128 : -110, s.selected.end.y - 35),
                    right: Math.max(p.foilX + 135, s.selected.end.x + 35), bottom: Math.max(138, s.footerY + 18, Math.max.apply(null, endpoints.map(function (v) { return v.y; })) + 35) };
            },
            handles: function (item) {
                var s = rutherfordState(item); var p = s.p;
                var handles = [{ id: 'foil', label: '金箔位置', x: p.foilX, y: 100, primary: !p.showOutgoing, readout: 'x ' + p.foilX + ' px' }];
                if (p.showOutgoing) handles.push({ id: 'scatter', label: '選定束／螢光屏', x: s.selected.end.x, y: s.selected.end.y, primary: true, readout: 'θ ' + p.spread + '°' });
                return handles;
            },
            update: function (item, id, point) {
                var s = rutherfordState(item); var p = s.p;
                if (id === 'foil') p.foilX = point.x;
                else if (id === 'scatter' && p.showOutgoing) {
                    var dx = point.x - s.selected.start.x; var dy = -p.scatterSide * (point.y - s.selected.start.y);
                    if (Math.hypot(dx, dy) < 1) return null;
                    // Crossing to the other side clamps to the nearest allowed
                    // endpoint angle, never silently flips the selected side.
                    var degrees = Math.atan2(Math.max(0, dy), dx) / DEG;
                    p.spread = degrees;
                } else return null;
                item.params = library.sanitizeParams('rutherfordScattering', p);
                return { readout: id === 'foil' ? 'x ' + item.params.foilX + ' px' : 'θ ' + item.params.spread + '°' };
            }
        }
    );
    add('modern', 'rutherfordScattering', '拉塞福 α 散射', 420, 270, function (ctx, item) {
        var s = rutherfordState(item); var p = s.p; var sourceX = -190;
        stroke(ctx, [[p.foilX, -100], [p.foilX, 100]]); text(ctx, '金箔', p.foilX, 118, 13);
        s.beams.forEach(function (beam) {
            arrow(ctx, sourceX, beam.start.y, beam.start.x, beam.start.y, 6);
            if (p.showOutgoing) arrow(ctx, beam.start.x, beam.start.y, beam.end.x, beam.end.y, beam.selected ? 7 : 6);
        });
        text(ctx, 'α 粒子束', sourceX + 40, -88, 13);
        if (p.showOutgoing) {
            // A movable detector segment follows the selected outgoing ray,
            // including backward angles; it is not a forward-only hemisphere.
            ctx.save(); ctx.lineWidth += 1; begin(ctx);
            ctx.arc(s.selected.start.x, s.selected.start.y, 150, s.angle - 0.10, s.angle + 0.10); ctx.stroke(); ctx.restore();
            text(ctx, '螢光屏（短弧，可移動）', p.foilX, s.footerY, 12);
            if (p.showAngle) {
                dashed(ctx, [[p.foilX, s.selected.start.y], [p.foilX + 50, s.selected.start.y]]);
                if (p.spread) { begin(ctx); ctx.arc(p.foilX, s.selected.start.y, 30, 0, s.angle, p.scatterSide > 0); ctx.stroke(); }
                text(ctx, 'θ = ' + p.spread + '°', p.foilX + 54, -110, 12);
            }
        }
    }, { keywords: ['拉塞福散射', '金箔實驗', '原子核'], modelNote: '實驗方向示意，不是單一原子核的庫侖雙曲線軌跡；金箔處的折線表示入射／出射方向。線條只挑選代表性路徑，不表示散射機率，不能用路徑數推算比例。可選 0～175°、向上／向下，包含大角度回射；恰好 180° 會與入射線重合，故未納入拖曳範圍。短弧為可移動螢光屏的選定位置，與選定射線終點相接；其他射線只表示方向。隱藏散射結果會同時移除出射線、屏位置、角度及控制點，JSON 仍保留結果資料。', suppressCommonLabel: true, parametric: rutherfordParametric });

    var massSpecParametric = smart(
        { radius: 72, plateLength: 125, fieldSize: 190 },
        [control('radius', '離子軌跡半徑', 35, 125, 1, 'px'), control('plateLength', '選速器長度', 75, 190, 1, 'px'), control('fieldSize', '分析磁場範圍', 130, 280, 1, 'px')],
        {
            sanitize: function (source) { var p = source || {}; var radius = Math.round(clamp(p.radius, 35, 125, 72)); return { radius: radius, plateLength: Math.round(clamp(p.plateLength, 75, 190, 125)), fieldSize: Math.round(clamp(p.fieldSize, Math.max(130, radius * 2 + 24), 280, 190)) }; },
            bounds: function (item) { var p = params('massSpectrometer', item); return { left: -275, top: -p.fieldSize + 4, right: -220 + p.plateLength + p.fieldSize + 16, bottom: 78 }; },
            handles: function (item) { var p = params('massSpectrometer', item); return [{ id: 'radius', label: '探測位置', x: -220 + p.plateLength, y: -2 * p.radius, primary: true, readout: '2r ' + 2 * p.radius + ' px' }]; },
            update: function (item, id, point) { if (id !== 'radius') return null; var p = params('massSpectrometer', item); p.radius = -point.y / 2; item.params = library.sanitizeParams('massSpectrometer', p); return { readout: 'r ' + item.params.radius + ' px' }; }
        }
    );
    add('modern', 'massSpectrometer', '速度選擇器與質譜儀', 500, 320, function (ctx, item) {
        var p = params('massSpectrometer', item); var left = -220; var selectorEnd = left + p.plateLength;
        stroke(ctx, [[left, -42], [selectorEnd, -42]]); stroke(ctx, [[left, 42], [selectorEnd, 42]]); text(ctx, '+ + +', (left + selectorEnd) / 2, -57, 13); text(ctx, '− − −', (left + selectorEnd) / 2, 57, 13);
        for (var x = left + 18; x < selectorEnd; x += 35) { circle(ctx, x, 0, 5, false); cross(ctx, x, 0, 3); }
        arrow(ctx, left - 38, 0, selectorEnd, 0, 7); text(ctx, 'v', left - 18, -14, 13);
        var fieldTop = 12 - p.fieldSize;
        ctx.save(); ctx.setLineDash([5, 5]); ctx.strokeRect(selectorEnd, fieldTop, p.fieldSize, p.fieldSize); ctx.restore();
        for (var gx = selectorEnd + 24; gx < selectorEnd + p.fieldSize - 15; gx += 42) { for (var gy = fieldTop + 22; gy < 0; gy += 45) { circle(ctx, gx, gy, 5, false); cross(ctx, gx, gy, 3); } }
        begin(ctx); ctx.arc(selectorEnd, -p.radius, p.radius, Math.PI / 2, -Math.PI / 2, true); ctx.stroke();
        stroke(ctx, [[selectorEnd, -2 * p.radius - 12], [selectorEnd, -2 * p.radius + 12]]); text(ctx, '感測器', selectorEnd - 8, -2 * p.radius - 18, 12, 'right');
    }, { keywords: ['質譜儀', '速度選擇器', '帶電粒子', '比荷'], suppressCommonLabel: true, parametric: massSpecParametric });

    var xrayTubeParametric = smart(
        { width: 380, height: 230, voltage: 1, current: 1 },
        [control('width', '裝置寬度', 260, 480, 1, 'px'), control('height', '裝置高度', 160, 320, 1, 'px'), control('voltage', '管電壓倍率', 0.5, 1.8, 0.1, '倍'), control('current', '管電流倍率', 0.3, 1.8, 0.1, '倍')],
        { bounds: function (item) { var p = params('xrayTube', item); return { left: -p.width / 2 - 16, top: -p.height / 2 - 30, right: p.width / 2 + 50, bottom: p.height / 2 + 30 }; } }
    );
    add('modern', 'xrayTube', 'X 射線管', 380, 230, function (ctx, item) {
        var p = params('xrayTube', item); var left = -p.width / 2; var right = p.width / 2;
        begin(ctx); ctx.ellipse(0, 0, p.width * 0.42, p.height * 0.38, 0, 0, Math.PI * 2); ctx.stroke();
        stroke(ctx, [[left + 45, -35], [left + 45, 35]]); text(ctx, 'K', left + 27, 0, 14);
        filledPath(ctx, [[right - 80, -45], [right - 38, -18], [right - 68, 40]]); text(ctx, 'A', right - 52, 54, 14);
        var beamCount = Math.max(2, Math.round(2 + p.current * 3));
        for (var i = 0; i < beamCount; i += 1) { var beamY = beamCount === 1 ? 0 : -20 + 40 * i / (beamCount - 1); arrow(ctx, left + 52, beamY, right - 75, beamY * 0.7, 6); }
        var xrayCount = Math.max(3, Math.round(3 + p.current * 2));
        for (var ray = 0; ray < xrayCount; ray += 1) { var spread = xrayCount === 1 ? 0 : -1 + 2 * ray / (xrayCount - 1); arrow(ctx, right - 58, spread * 4, right + 5 + 18 * p.voltage, spread * 54, 7); }
        text(ctx, 'X 射線', right - 2, -65, 14);
        text(ctx, 'V↑ ⇒ λₘᵢₙ↓；I↑ ⇒ 強度↑', 0, p.height / 2, 13);
    }, { keywords: ['X射線管', '制動輻射', '特性X射線'], suppressCommonLabel: true, parametric: xrayTubeParametric });

    var braggParametric = smart(
        { spacing: 42, angle: 28, layers: 5, rayLength: 135 },
        [control('spacing', '晶格間距 d', 24, 70, 1, 'px'), control('angle', '布拉格角', 8, 70, 1, '°'), control('layers', '晶面層數', 3, 8, 1, '層'), control('rayLength', '光線長度', 80, 200, 1, 'px')],
        {
            bounds: function (item) {
                var p = params('braggDiffraction', item); var theta = p.angle * DEG;
                var shift = Math.min(150, p.spacing * 0.65 / Math.max(0.15, Math.tan(theta)));
                return { left: -Math.max(160, p.rayLength) - 24, top: -Math.max(p.spacing, p.rayLength * Math.sin(theta)) - 30, right: Math.max(176, p.rayLength) + 44, bottom: p.spacing * (p.layers - 2) + 54 };
            },
            handles: function (item) { var p = params('braggDiffraction', item); var r = p.angle * DEG; return [{ id: 'angle', label: '布拉格角', x: Math.cos(r) * 80, y: -Math.sin(r) * 80, primary: true, readout: 'θ ' + p.angle + '°' }, { id: 'spacing', label: '晶面間距', x: 142, y: p.spacing, readout: 'd ' + p.spacing }]; },
            update: function (item, id, point) { var p = params('braggDiffraction', item); if (id === 'angle') p.angle = Math.abs(Math.atan2(-point.y, point.x) / DEG); else if (id === 'spacing') p.spacing = Math.abs(point.y); else return null; item.params = library.sanitizeParams('braggDiffraction', p); return { readout: id === 'angle' ? 'θ ' + item.params.angle + '°' : 'd ' + item.params.spacing }; }
        }
    );
    add('modern', 'braggDiffraction', '布拉格繞射', 400, 330, function (ctx, item) {
        var p = params('braggDiffraction', item); var r = p.angle * DEG;
        for (var layer = 0; layer < p.layers; layer += 1) { var y = (layer - 1) * p.spacing; stroke(ctx, [[-150, y], [150, y]]); for (var x = -135; x <= 135; x += 30) circle(ctx, x, y, 4, true); }
        var y1 = 0; var y2 = p.spacing;
        var upper = { x: 0, y: y1 }; var lower = { x: 0, y: y2 };
        var inVector = { x: Math.cos(r), y: Math.sin(r) };
        var outVector = { x: Math.cos(r), y: -Math.sin(r) };
        arrow(ctx, upper.x - inVector.x * p.rayLength, upper.y - inVector.y * p.rayLength, upper.x, upper.y, 8);
        arrow(ctx, upper.x, upper.y, upper.x + outVector.x * p.rayLength, upper.y + outVector.y * p.rayLength, 8);
        arrow(ctx, lower.x - inVector.x * p.rayLength, lower.y - inVector.y * p.rayLength, lower.x, lower.y, 8);
        arrow(ctx, lower.x, lower.y, lower.x + outVector.x * p.rayLength, lower.y + outVector.y * p.rayLength, 8);
        arrow(ctx, 142, y1, 142, y2, 7, true); text(ctx, 'd', 157, (y1 + y2) / 2, 14);
        dashed(ctx, [[upper.x, upper.y - 46], [upper.x, upper.y + 20]]);
        begin(ctx); ctx.arc(upper.x, upper.y, 25, -r, 0); ctx.stroke();
        text(ctx, 'θ', upper.x + 34, upper.y - 13, 14);
        text(ctx, '建設性干涉條件：2d sinθ = nλ', 0, p.spacing * (p.layers - 2) + 30, 13);
    }, { keywords: ['布拉格繞射', '晶格', 'X射線繞射'], suppressCommonLabel: true, parametric: braggParametric });

    var decayUnits = ['s', 'min', 'h', 'day', 'year'];
    function decayState(item) {
        var p = params('radioactiveDecay', item); var times = [0, p.timeMax];
        // Resolve rapid early decay even when the visible time range is very long.
        for (var i = 1; i < 160; i += 1) times.push(p.timeMax * i / 160);
        for (var j = 1; j <= 160; j += 1) { var t = p.halfLife * j / 10; if (t < p.timeMax) times.push(t); }
        times.sort(function (a, b) { return a - b; });
        var rows = times.map(function (t) { return [t, p.initialCount * Math.pow(2, -t / p.halfLife)]; });
        var plot = library.dataPlotState(item, rows, 'ordered', p.width, p.height);
        if (plot.domain[2] < 0) plot = library.dataPlotState({ type: item.type, params: { dataDomain: [0, p.timeMax, 0, plot.domain[3]] } }, rows, 'ordered', p.width, p.height);
        return { p: p, rows: rows, plot: plot };
    }
    var decayParametric = smart(
        { width: 360, height: 260, initialCount: 1000, halfLife: null, slope: null, timeMax: 8, timeUnit: 0, solutionMode: 1, dataDomain: null },
        [control('initialCount', '初始母核數量 N(0)', 1, 1000000, 1, '個'), control('halfLife', '半衰期（依所選時間單位）', 0.01, 10000, 0.01, ''), control('timeMax', '時間軸終點', 0.01, 100000, 0.01, ''), choice('timeUnit', '時間單位（數字不換算）', [{ value: 0, label: '秒 s' }, { value: 1, label: '分 min' }, { value: 2, label: '小時 h' }, { value: 3, label: '日 day' }, { value: 4, label: '年 year' }]), choice('solutionMode', '題目／解答', [{ value: 0, label: '題目（隱藏半衰期輔助線與答案）' }, { value: 1, label: '解答（顯示半衰期）' }]), control('width', '圖寬', 300, 560, 1, 'px'), control('height', '圖高', 220, 420, 1, 'px')],
        {
            bounds: function (item) { return graphFrame(item, 52); },
            handles: function (item) {
                var s = decayState(item); var handles = [{ id: 'initial', label: '初始母核數', x: s.plot.x(0), y: s.plot.y(s.p.initialCount), primary: true }];
                if (s.p.halfLife <= s.p.timeMax) handles.push({ id: 'half-life', label: '半衰期', x: s.plot.x(s.p.halfLife), y: s.plot.y(s.p.initialCount / 2), readout: graphNumber(s.p.halfLife) + ' ' + decayUnits[s.p.timeUnit] });
                return handles;
            },
            update: function (item, id, point) {
                var s = decayState(item);
                if (id === 'initial') { s.p.initialCount = s.plot.valueY(point.y); s.p.dataDomain = s.plot.domain; }
                else if (id === 'half-life') s.p.halfLife = clamp((point.x - s.plot.area.left) / (s.plot.area.right - s.plot.area.left) * s.p.timeMax, 0.01, Math.min(10000, s.p.timeMax), s.p.halfLife);
                else return null;
                item.params = library.sanitizeParams(item.type, s.p); return { readout: id === 'initial' ? 'N(0)=' + item.params.initialCount : graphNumber(item.params.halfLife) + ' ' + decayUnits[s.p.timeUnit] };
            }
        }
    );
    var sanitizeDecay = decayParametric.sanitize;
    decayParametric.getControls = function () { return decayParametric.controls.map(function (c) { return c.key === 'halfLife' ? Object.assign({}, c, { continuous: true }) : c; }); };
    decayParametric.sanitize = function (source) {
        var p = sanitizeDecay(source);
        if (source.halfLife == null) { p.halfLife = source.slope != null && Number(source.slope) > 0 ? Math.log(2) / clamp(source.slope, 0.25, 1.5, 0.8) : 2; if (source.slope != null) p.timeMax = 4; }
        // Preserve migrated precision and range-step rounding cannot produce zero.
        p.halfLife = clamp(source.halfLife == null ? p.halfLife : source.halfLife, 0.01, 10000, 2);
        p.dataDomain = source.dataDomain; return p;
    };
    add('modern', 'radioactiveDecay', '放射性衰變與半衰期', 360, 320, function (ctx, item) {
        var s = decayState(item); var p = s.p; var a = s.plot; var unit = decayUnits[p.timeUnit];
        library.drawDataAxes(ctx, item, a, 't (' + unit + ')', 'N (個)');
        stroke(ctx, s.rows.map(function (r) { return [a.x(r[0]), a.y(r[1])]; }));
        text(ctx, 'N(0)=' + graphNumber(p.initialCount) + ' 個母核', 0, p.height / 2 + 13, 12);
        if (!p.solutionMode) return;
        for (var n = 1; n <= 4 && n * p.halfLife <= p.timeMax; n += 1) {
            var t = n * p.halfLife; var remaining = p.initialCount * Math.pow(2, -n);
            dashed(ctx, [[a.x(t), a.y(0)], [a.x(t), a.y(remaining)], [a.x(0), a.y(remaining)]]);
        }
        text(ctx, '半衰期 = ' + graphNumber(p.halfLife) + ' ' + unit + (p.halfLife > p.timeMax ? '（在圖外）' : ''), 0, p.height / 2 + 33, 12);
    }, { keywords: ['放射性衰變', '半衰期', '指數衰減'], modelNote: 'N(t)=N(0)×2^(−t/T)，表示大量同種母核的平均剩餘數量，不是單顆原子的確定衰變時刻。時間單位選項只改題設單位，不把數字換算成另一單位。最多標示前四個半衰期，超出時間範圍不硬塞入圖內；更改數字欄可顯示圖外半衰期。題目版保留曲線，隱藏半衰期輔助線與答案。', suppressCommonLabel: true, parametric: decayParametric });

    var fissionParametric = smart(
        { branches: 3, neutronLength: 70, nucleus: 34, solutionMode: 1 },
        [control('branches', '示意釋出中子數（非固定產額）', 2, 4, 1, '個'), control('neutronLength', '後續中子箭長', 45, 105, 1, 'px'), control('nucleus', '原子核符號半徑', 22, 44, 1, 'px'), solutionControl()],
        {
            bounds: function (item) { var p = params('nuclearFission', item); return { left: -320, top: -166, right: 150 + p.neutronLength, bottom: 178 }; },
            handles: function (item) { var p = params('nuclearFission', item), h = [{ id: 'nucleus', label: '原子核符號大小', x: -200 + p.nucleus, y: 0, readout: 'r ' + p.nucleus }]; if (p.solutionMode) h.push({ id: 'generation', label: '後續中子箭長', x: 130 + p.neutronLength, y: -138, primary: true, readout: 'L ' + p.neutronLength }); return h; },
            update: function (item, id, point) { var p = params('nuclearFission', item); if (id === 'nucleus') p.nucleus = Math.max(22, point.x + 200); else if (id === 'generation') p.neutronLength = point.x - 130; else return null; item.params = library.sanitizeParams('nuclearFission', p); return { readout: id === 'nucleus' ? 'r ' + item.params.nucleus : 'L ' + item.params.neutronLength }; }
        }
    );
    add('modern', 'nuclearFission', '核分裂鏈式反應', 520, 330, function (ctx, item) {
        var p = params('nuclearFission', item), primaryX = -200;
        arrow(ctx, -310, 0, primaryX - p.nucleus - 5, 0, 7); text(ctx, 'n', -282, -15, 14);
        circle(ctx, primaryX, 0, p.nucleus, true); text(ctx, 'U-235', primaryX, 0, 12);
        text(ctx, '吸收中子前', primaryX, -77, 13);
        arrow(ctx, -143, 0, -105, 0, 7); text(ctx, '分裂', -124, 20, 12);
        if (!p.solutionMode) { text(ctx, '請補畫分裂產物與後續反應', 42, 0, 13); return; }
        circle(ctx, -62, -45, p.nucleus * .58, true); text(ctx, '碎片', -62, -45, 10);
        circle(ctx, -62, 45, p.nucleus * .5, true); text(ctx, '碎片', -62, 45, 10);
        text(ctx, '分裂後', -62, -85, 13);
        for (var i = 0; i < p.branches; i += 1) {
            var targetY = -120 + 240 * i / (p.branches - 1), targetX = 130, r = p.nucleus * .55;
            var dx = targetX + 43, dy = targetY, length = Math.hypot(dx, dy);
            arrow(ctx, -43, 0, targetX - dx / length * (r + 3), targetY - dy / length * (r + 3), 6);
            text(ctx, 'n', 36, targetY * .5 - 9, 12);
            circle(ctx, targetX, targetY, r, true); text(ctx, 'U-235', targetX, targetY, 9);
            arrow(ctx, targetX + r + 3, targetY, targetX + p.neutronLength, targetY - 18, 6);
            arrow(ctx, targetX + r + 3, targetY, targetX + p.neutronLength, targetY + 18, 6);
        }
        text(ctx, '不同階段的因果示意，非同時位置或固定分裂產額', -30, 163, 12);
    }, { keywords: ['核分裂', '鏈式反應', '中子', '核能'], modelNote: '由左至右表示不同時間階段：重核吸收中子、分裂成兩碎片並釋出中子、中子引發其他重核分裂。不是母核與碎片同時存在於同一位置；右側箭頭概括後續分裂而省略其碎片。分支數只為代表性示意，並非每次固定產額，也未計入逃逸、非分裂吸收、延遲中子或臨界條件。未指定碎片核種，不能用這張示意圖當已配平的核反應式；題目模式隱藏產物。', suppressCommonLabel: true, parametric: fissionParametric });

    function bohrShellPopulation(atomicNumber) {
        var remaining = atomicNumber; var capacities = [2, 8, 8];
        return capacities.map(function (capacity) { var count = Math.min(capacity, remaining); remaining -= count; return count; }).filter(function (count) { return count > 0; });
    }
    var bohrParametric = smart(
        { atomicNumber: 4, radius: 36 },
        [control('atomicNumber', '原子序 Z（1–18）', 1, 18, 1, ''), control('radius', '層間距', 24, 48, 1, 'px')],
        {
            sanitize: function (source) {
                var incoming = source && typeof source === 'object' ? source : {};
                return { atomicNumber: Math.round(clamp(incoming.atomicNumber, 1, 18, clamp(incoming.electrons, 1, 18, 4))), radius: Math.round(clamp(incoming.radius, 24, 48, 36)) };
            },
            bounds: function (item) { var p = params('bohrAtom', item); var extent = bohrShellPopulation(p.atomicNumber).length * p.radius; return { left: -extent - 16, top: -extent - 16, right: extent + 16, bottom: extent + 16 }; },
            handles: function (item) { var p = params('bohrAtom', item); var shells = bohrShellPopulation(p.atomicNumber).length; return [{ id: 'radius', label: '殼層間距', x: shells * p.radius, y: 0, primary: true, readout: 'Z=' + p.atomicNumber + ' · ' + shells + ' 層' }]; },
            update: function (item, id, point) { if (id !== 'radius') return null; var p = params('bohrAtom', item); var shells = bohrShellPopulation(p.atomicNumber).length; p.radius = Math.abs(point.x) / shells; item.params = library.sanitizeParams('bohrAtom', p); return { readout: 'Z=' + item.params.atomicNumber + ' · r ' + item.params.radius }; }
        }
    );
    add('modern', 'bohrAtom', '波耳殼層模型（Z≤18）', 250, 250, function (ctx, item) {
        var p = params('bohrAtom', item);
        var population = bohrShellPopulation(p.atomicNumber);
        circle(ctx, 0, 0, 15, true); text(ctx, '+' + p.atomicNumber + 'e', 0, 0, 11);
        population.forEach(function (count, shellIndex) {
            var shell = shellIndex + 1; circle(ctx, 0, 0, p.radius * shell, false);
            for (var e = 0; e < count; e += 1) { var angle = (-Math.PI / 2) + e * Math.PI * 2 / count; var x = Math.cos(angle) * p.radius * shell; var y = Math.sin(angle) * p.radius * shell; dot(ctx, x, y, 4); text(ctx, '−', x, y - 11, 11); }
        });
    }, { keywords: ['波耳模型', '原子模型', '電子殼層', '氫原子'], suppressCommonLabel: true, parametric: bohrParametric });

    // Preserve teaching scope as documentation metadata. A draggable
    // symbol is not automatically a numerical physics solver. Preserve the
    // more specific notes declared alongside individual models above.
    function explainScope(types, note) {
        types.split(' ').forEach(function (type) {
            var definition = library.getDefinition(type);
            if (definition && !definition.modelNote) definition.modelNote = note;
        });
    }
    explainScope('text label', '單行文字標註，可直接編輯內容；不是完整數學公式排版器。請在匯出後確認中文字型與符號是否完整。');
    explainScope('line dashedLine arrow doubleArrow dimensionLine point groundLine block ball cart surface rope fulcrum ground', '獨立組裝符號；尺寸為排圖 px，不代表物理量，也不會自動依附其他物件或求平衡。');
    explainScope('forceArrow velocityArrow accelerationArrow currentArrow ray normalLine', '獨立方向標註；箭長與線長是排圖尺寸，不會自動求物理量或跟隨其他物件。需要相依方向時請用對應的智慧題型。');
    explainScope('cell battery resistor resistorTaiwan lamp motor capacitor polarizedCapacitor inductor diode led fuse acSource', '電路組裝符號；端點可接導線，尺寸不代表電壓、電阻、電容或電流。文字可改為題設值；本編輯器不自動解電路。');
    explainScope('variableResistor variableResistorTaiwan', '兩端可變電阻符號，斜箭表示可調，不是第三接線端。需要滑片接線或分壓題，請用「三端滑動變阻器」。');
    explainScope('ammeter voltmeter galvanometer', '電表符號，不是可讀數的儀器。接法與正負端需依題設安排；可用「電流電壓測量接線」製作內接／外接題。');
    explainScope('switchOpen switchClosed', '開路與閉合是不同預設，兩者都能調角度；0° 才接通。只改接線圖，不會自動計算其他元件的電流。');
    explainScope('singleSlit doubleSlit barrier planeMirror screen prism principalAxis focalMarker', '光學組裝素材；尺寸、位置與標示供排圖，不會自動折射光線或連動焦點。成像與干涉計算請選專用智慧題型。');
    explainScope('convexLens concaveLens', '鏡片輪廓符號；改輪廓寬度不等於設定焦距，也不會自動成像。請用成像智慧圖設定物距、焦距與光線。');
    explainScope('concaveMirror convexMirror', '獨立曲面鏡符號，斜線代表鏡背；曲率與高度只用來排圖，不會自動反射已放置的光線。');
    explainScope('axes lineGraph curveGraph', '幾何示意圖，不是通用試算表；點高為正規化比例。若需負值、實際刻度、多段數據或擬合，請改用專用運動圖或誤差棒素材。');
    explainScope('pointGraph barGraph', '保留舊版比例示意；自訂資料支援 1～32 筆、負值與數值刻度，可逐行增刪或貼上兩欄。散點藍點可改 x、y；長條藍點改值，x／類別編號由資料欄設定。單位與類別名稱可改軸及內部標示。');
    explainScope('velocityTimeGraph accelerationTimeGraph', '預設模式是無單位比例示意；「自訂數據」可貼上時間與物理量並顯示刻度，單位請由軸標籤補充。線段按輸入資料連接，不會與別張運動圖自動同步。');
    explainScope('magneticIntoPage magneticOutPage uniformMagneticField', '點表示出紙面、叉表示入紙面；符號大小與數量只控制圖面密度，不是磁場強度。');
    var scopeNotes = {
        angleArc: '有向角度標註，角度由右方基準起算；不是量角器，不會自動量測其他線段之間的夾角。',
        ramp: '拖斜面端點調角度；改底長保持斜角。斜面與另放的木塊不會自動吸附或連動，請校對接觸與受力方向。',
        pulley: '兩側繩端可連接繩子與懸掛砝碼，移動、旋轉或調整滑輪後保持接點。兩側繩長仍獨立，不自動約束總繩長或求張力；固定總繩長的兩砝碼系統請用阿特伍德機。',
        movablePulley: '兩側上繩端及下方掛鉤可連接繩子、懸掛砝碼，連接後會跟隨幾何調整。這是組裝連接，不自動求整組繩長約束、位移比或張力。',
        pendulum: '擺角相對鉛直；可鎖定擺長只改角度。這是單一姿態，不模擬週期、速度、張力或能量。擺錘大小不代表質量。',
        hangingMass: '上端繩頭可吸附滑輪接點或繩子端點，也可由繩端連接選單指定。移動父物件與改繩長保持連接；拖動砝碼可重新定位，Alt 拖曳不吸附，方向鍵移動會解除連接。尺寸不表示質量。',
        lever: '支點固定；左右桿長是沿桿距離，不是力臂。可鎖定桿角度；力臂應由支點到力的作用線取垂距。',
        projectilePath: '支援左右斜拋、水平拋射、鉛直上拋。斜拋由角度、射程、高差決定向下凹的軌跡；水平拋射落點必低於起點；鉛直上拋由最高點與落點高度決定。不是獨立輸入初速與 g 的時間模擬，初速度箭長為示意並可隱藏。',
        junction: '帶實心點的 T 形接線點，表示相連；不是跨線不接通符號。分支可接導線。',
        wire: '拖端點吸附到電路元件的接線端後會跟隨移動、旋轉與參數變更；直接搬動整條線或改自由線長會解除連接。只保存連接幾何，不自動求電路電流。',
        rope: '繩端可吸附定／動滑輪接點，跟隨接點伸縮；懸掛砝碼可接到繩端。直接搬動整條繩或改自由長度會解除繩子與滑輪的連接。未施加不可伸長約束，不求張力。',
        interference: '同相雙點源的等間隔波前示意；不是光強或節線圖，交點不能直接當成暗紋。若需縫寬包絡與光強請用雙狹縫實驗或光強圖。',
        constantVelocityGraph: '水平 v–t 示意，容許正、零、負速度；沒有實際時間刻度。要出定量題請另補單位與刻度，或改用自訂速度數據圖。',
        torqueDiagram: 'r 從固定支點指向作用點；力臂 d 是到作用線的垂距，不是沿桿長。負角表示另一側施力；平行時力臂為零。箭長為示意，題目模式隱藏力臂與解答。',
        atwoodMachine: '理想單一定滑輪幾何，兩側垂直繩長總和固定，一邊上升另一邊下降；滑輪尺寸與砝碼外觀非質量比例。質量是題設標示，不自動求加速度或張力。',
        orbitDiagram: '橢圓軌道與焦點示意，可切換順逆時針並隱藏速度箭頭。位置參數是橢圓參數角，不是均勻時間或真近點角。速度沿切線，但箭長有顯示上下限，不可當成精確速率比例。',
        equipotentialMap: '等量異號點電荷的庫侖等位線；閉合虛線逐點求解，中央虛線為零電位，並非零電場。電位提示可隱藏；未標示伏特值，線間距不是場強直接刻度。',
        barMagnetField: '磁力線方向示意：外部由 N 到 S，內部回到 N；本圖省略磁鐵內部路徑。外線形狀不是精確有限磁鐵場解。線數與磁鐵尺寸不代表磁通量或場強數值。',
        wireMagneticField: '垂直紙面長直導線的磁場截面，電流反向會反轉磁場繞行方向。圓圈是磁力線，不是導線線圈；圈數不是場強。',
        loopMagneticField: '圓線圈側向投影，只標線圈軸向磁場，不是完整三維場線；電流方向同步決定 B。箭長與顯示匝數僅供示意。',
        chargedParticleElectric: '均勻電場內水平入射的軌跡示意；首次碰板即停止，出場後接切線。電性與板極性要明確切換，拖偏轉不改電性；未輸入實際 q、m、E、v。',
        chargedParticleMagnetic: '均勻磁場圓弧與出場切線；入射場區和場內起始是不同情境。半徑、偏轉角為題圖幾何，未輸入實際 q、m、B、v。電性與磁場方向需明確切換。',
        conductorForce: '可切換左右電流及出入紙面磁場，受力方向依 I×B 同步更新，亦可隱藏受力供作答。線長與力箭長為排圖尺度，未由 BIL 計算大小。',
        transformer: '一次／二次繞組保持連續；匝數只表示比例與接線符號，未加入負載、損耗、互感或相位點。請在題幹說明是否採理想交流變壓器。',
        seriesCircuitDiagram: '電阻串聯的接線題圖，可增減電阻與調開關。標示可改，未自動求總電阻、電流或功率。',
        parallelCircuitDiagram: '電阻並聯的接線題圖，可增減支路與調開關。接點表示導通；標示可改，未自動求支路電流或總電阻。',
        lensRayDiagram: '薄凸透鏡近軸作圖；物距、焦距與物高使用共同圖上比例，非公尺。實像實線、虛像虛線；像在畫面外會標明，恰在焦點則不畫有限像。題目版隱藏解答光線與像。',
        concaveLensRayDiagram: '薄凹透鏡近軸作圖；實物在鏡前，焦距欄輸入大小，生成同側正立縮小虛像。虛像與光線反向延長使用虛線；題目模式保留物與鏡。',
        singleSlitIntensity: '均勻照明單縫的遠場 sinc² 相對光強；中央亮紋全寬是兩側第一暗紋間距，不是縫寬。圖面尺度尚未指定 λ、縫寬與屏距。',
        doubleSlitIntensity: '雙縫遠場光強包含單縫包絡；條紋與包絡間距是屏上圖面比例，不是可獨立任意指定的實體縫寬與縫距。圖框外曲線不顯示。',
        pvProcessGraph: '理想氣體過程比較，等溫與絕熱共用起始狀態；γ 可調。座標是相對比例，未指定 P、V 的實際單位，不能直接把圖面積當 J。',
        speedDistribution: '同種理想氣體的 Maxwell 速率分布，溫度以相對倍率比較；縱軸為機率密度，不是單一速率的機率。只截取有限速率窗，曲線面積的完整歸一化包含圖外尾端。',
        calorimeter: '量熱裝置與熱流方向示意，箭頭正負改方向、零值隱藏。未計算溫度、熱容量或熱平衡，也未把箭長換算成焦耳。',
        photoelectricGraph: '最大初動能對頻率的定性圖，改臨界頻率保持 h 所對應的斜率；低於臨界不畫負動能。需精確數值時用光電效應實驗裝置。',
        cathodeRayTube: '電子束通過偏轉板的原理圖，偏轉限制在管體內；不是碰壁、螢光亮度或真實電壓的模擬。板極性決定電子偏轉方向。',
        massSpectrometer: '正離子通過速度選擇器後進入分析磁場的示意，入口與圓弧相切；半徑供排圖，未由實際 E、B、q、m 自動求解，也不表示多核種同時分離。',
        xrayTube: 'X 射線產生原理示意，不是完整高壓接線圖；電壓／電流是相對倍率，不是 kV、mA 或定量光譜，不可用於實際裝置操作。',
        braggDiffraction: '相鄰晶面上的光程差幾何；θ 從晶面量起，2d sinθ=nλ 是亮紋條件，不表示每組可調 θ 都符合某個固定波長。未指定波長或晶體結構因子。',
        bohrAtom: '中性原子 Z=1～18 的基態殼層填充示意，不支援離子、激發態或量子軌域；同層電子等距僅為排圖，不表示真實固定軌道與位置。'
    };
    Object.keys(scopeNotes).forEach(function (type) { explainScope(type, scopeNotes[type]); });
}());
