//#region src/bot/math.ts
var e = Math.PI * 2, t = (e, t = 0, n = 1) => e < t ? t : e > n ? n : e, n = (e, t, n) => e + (t - e) * n, r = {
	easeOutCubic: (e) => 1 - (1 - e) ** 3,
	easeInOutCubic: (e) => e < .5 ? 4 * e ** 3 : 1 - (-2 * e + 2) ** 3 / 2,
	easeOutQuint: (e) => 1 - (1 - e) ** 5
};
function i(t, n, r = 0) {
	let i = t / n * e;
	return .55 * Math.sin(i + r) + .3 * Math.sin(2 * i + r * 1.7 + 1.1) + .15 * Math.sin(3 * i + r * 2.3 + 2.4);
}
function a(e) {
	let t = e >>> 0;
	return () => {
		t = t + 1831565813 >>> 0;
		let e = Math.imul(t ^ t >>> 15, 1 | t);
		return e = e + Math.imul(e ^ e >>> 7, 61 | e) ^ e, ((e ^ e >>> 14) >>> 0) / 4294967296;
	};
}
var o = (e) => Math.round(e * 100) / 100, s = [
	"taper",
	"paddle",
	"knuckle"
], c = [
	"flow",
	"breathe",
	"skitter",
	"doze"
], l = [
	{
		id: "ink",
		hex: "#111318"
	},
	{
		id: "paper",
		hex: "#f9f9f9"
	},
	{
		id: "cobalt",
		hex: "#315ea8"
	},
	{
		id: "ember",
		hex: "#b84d3e"
	},
	{
		id: "moss",
		hex: "#4f765d"
	},
	{
		id: "violet",
		hex: "#735f91"
	},
	{
		id: "amber",
		hex: "#b87a2e"
	}
], u = [
	{
		angle: -148,
		reach: .94,
		bend: -.62
	},
	{
		angle: -32,
		reach: 1.08,
		bend: .5
	},
	{
		angle: 30,
		reach: .92,
		bend: -.58
	},
	{
		angle: 150,
		reach: 1.04,
		bend: .54
	}
], d = {
	bodyAspect: 0,
	legLength: 1,
	legThickness: 1,
	legStyle: "taper",
	eyeColor: l[0].hex,
	legs: u.map((e) => ({ ...e }))
}, f = {
	amount: .55,
	speed: 1,
	rhythm: "breathe"
}, p = (e, t) => typeof e == "number" && Number.isFinite(e) ? e : t;
function m(e) {
	return ((p(e, 0) + 180) % 360 + 360) % 360 - 180;
}
function h(e = {}, n = u[0]) {
	return {
		angle: m(p(e.angle, n.angle)),
		reach: t(p(e.reach, n.reach), .65, 1.35),
		bend: t(p(e.bend, n.bend), -1, 1)
	};
}
function g(e = {}) {
	let n = t(p(e.legSpread, 0), -1, 1), r = [
		-1,
		1,
		1,
		-1
	], i = Array.isArray(e.legs) ? e.legs : [], a = u.map((e, t) => {
		let a = {
			...e,
			angle: e.angle + (r[t] ?? 0) * n * 15
		};
		return h(i[t], a);
	}), o = {
		silk: "taper",
		petal: "paddle"
	}, c = typeof e.legStyle == "string" ? e.legStyle : "", l = s.includes(c) ? c : o[c] ?? d.legStyle, f = typeof e.eyeColor == "string" && /^#[0-9a-f]{6}$/i.test(e.eyeColor) ? e.eyeColor.toLowerCase() : d.eyeColor;
	return {
		bodyAspect: t(p(e.bodyAspect, d.bodyAspect), -1, 1),
		legLength: t(p(e.legLength, d.legLength), .72, 1.3),
		legThickness: t(p(e.legThickness, d.legThickness), .65, 1.35),
		legStyle: l,
		eyeColor: f,
		legs: a
	};
}
function _(e = {}) {
	let n = c.includes(e.rhythm) ? e.rhythm : f.rhythm;
	return {
		amount: t(p(e.amount, f.amount), 0, 1),
		speed: t(p(e.speed, f.speed), .35, 2),
		rhythm: n
	};
}
function v(e) {
	let t = g(e);
	return {
		sx: 1 + t.bodyAspect * .14,
		sy: 1 - t.bodyAspect * .11
	};
}
function y(e, t) {
	let { sx: n, sy: r } = v(t);
	return e.map((t, i) => {
		let a = i / e.length * Math.PI * 2, o = Math.cos(a), s = Math.sin(a);
		return t / Math.sqrt(o * o / (n * n) + s * s / (r * r));
	});
}
var b = (e, t) => ({
	x: e,
	y: t
}), x = (e, t) => b(e.x + t.x, e.y + t.y), S = (e, t) => b(e.x * t, e.y * t), C = (e, t, n) => b(e.x + (t.x - e.x) * n, e.y + (t.y - e.y) * n), w = (e) => {
	let t = Math.max(1e-4, Math.hypot(e.x, e.y));
	return b(e.x / t, e.y / t);
}, T = (e) => b(-e.y, e.x), E = (e) => `${o(e.x)} ${o(e.y)}`;
function D(e, t, n, r) {
	return k(e, t, n, {
		root: .135 * r,
		middle: .092 * r,
		tip: .042 * r
	});
}
function O(e, t, n, r) {
	return k(e, t, n, {
		root: .078 * r,
		middle: .094 * r,
		tip: .17 * r
	});
}
function k(e, t, n, r) {
	let i = w(b(t.x - e.x, t.y - e.y)), a = w(b(n.x - t.x, n.y - t.y)), o = T(i), s = T(a), c = x(e, S(o, r.root)), l = x(e, S(o, -r.root)), u = x(n, S(s, r.tip)), d = x(n, S(s, -r.tip)), f = C(e, t, .82), p = C(t, n, .18), m = x(f, S(o, r.middle)), h = x(f, S(o, -r.middle)), g = x(p, S(s, r.middle)), _ = x(p, S(s, -r.middle)), v = r.tip * 1.34, y = x(u, S(a, v)), D = x(d, S(a, v)), O = [
		c,
		m,
		g,
		u,
		y,
		D,
		d,
		_,
		h,
		l
	];
	return {
		d: [
			`M ${E(c)}`,
			`C ${E(m)} ${E(g)} ${E(u)}`,
			`C ${E(y)} ${E(D)} ${E(d)}`,
			`C ${E(_)} ${E(h)} ${E(l)}`,
			"Z"
		].join(" "),
		outline: O
	};
}
function A(e, t, n, r) {
	let i = w(b(t.x - e.x, t.y - e.y)), a = w(b(n.x - t.x, n.y - t.y)), o = T(i), s = T(a), c = .105 * r, l = .09 * r, u = .055 * r, d = l * 1.55, f = d * .78, p = x(e, S(o, c)), m = x(e, S(o, -c)), h = x(x(t, S(o, l)), S(i, -d)), g = x(x(t, S(s, l)), S(a, d)), _ = x(h, S(i, f)), v = x(g, S(a, -f)), y = x(x(t, S(s, -l)), S(a, d)), C = x(x(t, S(o, -l)), S(i, -d)), D = x(y, S(a, -f)), O = x(C, S(i, f)), k = x(n, S(s, u)), A = x(n, S(s, -u)), j = x(k, S(a, u * 1.34)), M = x(A, S(a, u * 1.34)), ee = [
		p,
		h,
		_,
		v,
		g,
		k,
		j,
		M,
		A,
		y,
		D,
		O,
		C,
		m
	];
	return {
		d: [
			`M ${E(p)}`,
			`L ${E(h)}`,
			`C ${E(_)} ${E(v)} ${E(g)}`,
			`L ${E(k)}`,
			`C ${E(j)} ${E(M)} ${E(A)}`,
			`L ${E(y)}`,
			`C ${E(D)} ${E(O)} ${E(C)}`,
			`L ${E(m)}`,
			"Z"
		].join(" "),
		outline: ee
	};
}
function j(e, t) {
	let n = g(t), { sx: r, sy: i } = v(n);
	return u.map((t, a) => {
		let o = h(n.legs[a] ?? e[a] ?? t, e[a] ?? t), s = o.angle * Math.PI / 180, c = b(Math.cos(s), Math.sin(s)), l = T(c), u = 1 / Math.sqrt(c.x * c.x / (r * r) + c.y * c.y / (i * i)), d = S(c, u * .38), f = S(c, u * .68), p = .56 * n.legLength * o.reach, m = o.bend * p, g = x(x(f, S(c, p * .5)), S(l, m * (n.legStyle === "knuckle" ? .42 : .32))), _ = x(x(f, S(c, p)), S(l, m * .08)), v = n.legStyle === "taper" ? D(d, g, _, n.legThickness) : n.legStyle === "paddle" ? O(d, g, _, n.legThickness) : A(d, g, _, n.legThickness);
		return {
			...o,
			d: v.d,
			knuckle: n.legStyle === "knuckle" ? {
				root: d,
				elbow: g,
				tip: _,
				thickness: n.legThickness
			} : void 0,
			pivotX: f.x,
			pivotY: f.y,
			jointX: g.x,
			jointY: g.y,
			tipX: _.x,
			tipY: _.y,
			minX: Math.min(...v.outline.map((e) => e.x)),
			minY: Math.min(...v.outline.map((e) => e.y)),
			maxX: Math.max(...v.outline.map((e) => e.x)),
			maxY: Math.max(...v.outline.map((e) => e.y))
		};
	});
}
var M = (e) => {
	let n = t(e, 0, 1);
	return n * n * (3 - 2 * n);
}, ee = {
	breathe: {
		period: 5.2,
		start: 3.15,
		duration: 1.55
	},
	skitter: {
		period: 3.8,
		start: 1.95,
		duration: 1.15
	},
	doze: {
		period: 6.6,
		start: 3.85,
		duration: 2.15
	}
};
function te(e, n, r) {
	if (r === "flow") return {
		mix: 0,
		rotation: 0,
		jointRotation: 0
	};
	let { period: i, start: a, duration: o } = ee[r], s = (Math.max(0, p(e, 0)) % i + i) % i;
	if (s < a || s > a + o) return {
		mix: 0,
		rotation: 0,
		jointRotation: 0
	};
	let c = t((s - a) / o, 0, 1), l = M(c / .18) * M((1 - c) / .22), u = [
		-1,
		1,
		1,
		-1
	][n] ?? (n % 2 ? 1 : -1), d = [
		1,
		-1,
		1,
		-1
	][n] ?? (n % 2 ? -1 : 1);
	if (r === "breathe") {
		let e = Math.sin(Math.PI * c), t = Math.sin(Math.PI * 2 * c);
		return {
			mix: l,
			rotation: u * (6.6 * e + 1.3 * t) * l,
			jointRotation: -u * (9.4 * e - 1.1 * t) * l
		};
	}
	if (r === "skitter") {
		let e = Math.sin(Math.PI * 6 * c + (d < 0 ? Math.PI : 0)), t = Math.sin(Math.PI * 6 * c + .72 + (d < 0 ? Math.PI : 0));
		return {
			mix: l,
			rotation: u * e * 8.2 * l,
			jointRotation: -u * t * 11.5 * l
		};
	}
	let f = Math.sin(Math.PI * c) ** 2, m = Math.sin(Math.PI * 4 * c) * Math.sin(Math.PI * c);
	return {
		mix: l,
		rotation: (-u * 5.4 * f + d * 1.7 * m) * l,
		jointRotation: (u * 14.5 * f + d * 2.4 * m) * l
	};
}
function ne(e, t, n) {
	let r = _(n);
	if (r.amount === 0) return {
		rotation: 0,
		jointRotation: 0,
		reach: 0
	};
	let a = Math.max(0, p(e, 0)) * r.speed, { cadence: o, amplitude: s } = {
		flow: {
			cadence: 1,
			amplitude: .88
		},
		breathe: {
			cadence: .72,
			amplitude: .72
		},
		skitter: {
			cadence: 2.15,
			amplitude: 1
		},
		doze: {
			cadence: .52,
			amplitude: .52
		}
	}[r.rhythm], c = [
		0,
		Math.PI,
		0,
		Math.PI
	][t] ?? t * Math.PI * .5, l = [
		-1,
		1,
		-1,
		1
	][t] ?? (t % 2 ? 1 : -1), u = a * (Math.PI * 2 / 3.4) * o, d = [
		.35,
		2.15,
		4.3,
		5.85
	][t] ?? t * 1.7, f = Math.sin(u + c), m = Math.sin(u * .52 + c * .35 + t * .22), h = i(a, 5.2 + t * .31, d) * .65, g = Math.sin(u * 1.18 + c + .82), v = i(a, 4.35 + t * .27, d + 1.65), y = te(a, t, r.rhythm), b = 1 - y.mix * .82, x = (f * l * 3.4 + m * 1.15 + h) * s, S = (g * l * -5.4 + v * 1.45) * s;
	return {
		rotation: (x * b + y.rotation) * r.amount,
		jointRotation: (S * b + y.jointRotation) * r.amount,
		reach: 0
	};
}
function re(e, t) {
	if (!e.knuckle || t === 0) return e.d;
	let { root: n, elbow: r, tip: i, thickness: a } = e.knuckle, o = t * Math.PI / 180, s = b(i.x - r.x, i.y - r.y);
	return A(n, r, b(r.x + s.x * Math.cos(o) - s.y * Math.sin(o), r.y + s.x * Math.sin(o) + s.y * Math.cos(o)), a).d;
}
//#endregion
//#region src/bot/face.ts
var ie = 15.46, ae = .186, oe = .412, N = {
	yaw: 28.49,
	pitch: 28.62,
	roll: -13
}, P = (e) => e * Math.PI / 180;
function F(e, t, n) {
	let r = Math.cos(n), i = Math.sin(n);
	return [[
		e[0] * r + t[0] * i,
		e[1] * r + t[1] * i,
		e[2] * r + t[2] * i
	], [
		t[0] * r - e[0] * i,
		t[1] * r - e[1] * i,
		t[2] * r - e[2] * i
	]];
}
function se(e, t, n = ie) {
	let r = [
		0,
		0,
		1
	], i = [
		1,
		0,
		0
	], a = [
		0,
		1,
		0
	];
	[r, i] = F(r, i, P(e.yaw)), [a, r] = F(a, r, P(e.pitch)), [i, a] = F(i, a, P(e.roll));
	let o = (e) => {
		let [o, s] = F(r, i, P(n * e));
		return {
			x: o[0] * t,
			y: o[1] * t,
			a: s[0],
			b: s[1],
			c: a[0],
			d: a[1],
			depth: o[2]
		};
	};
	return [o(-1), o(1)];
}
var ce = a(24301), le = (() => {
	let e = [], t = 1.4;
	for (; t < 900;) e.push(t), t += 1.9 + ce() * 2.7, ce() < .18 && (e.push(t), t += .24);
	return e;
})(), ue = .18;
function de(e) {
	for (let t = 0; t < le.length; t++) {
		let n = le[t];
		if (e < n) break;
		let r = (e - n) / ue;
		if (r >= 0 && r <= 1) return r < .45 ? 1 - r / .45 : (r - .45) / .55;
	}
	return 1;
}
function fe(e, t = {}) {
	let { wander: n = 1, blink: r = !0, float: a = !0 } = t;
	return {
		dYaw: (i(e, 11.3, .4) * 5.5 + i(e, 3.7, 2.1) * 1.6) * n,
		dPitch: (i(e, 9.1, 1.3) * 4.2 + i(e, 4.3, .7) * 1.3) * n,
		dRoll: i(e, 13.7, 3.2) * 2.2 * n,
		lid: r ? de(e) : 1,
		driftX: a ? i(e, 7.9, 1.9) * .006 : 0,
		driftY: a ? i(e, 5.3, .3) * .007 : 0,
		breath: a ? 1 + Math.sin(e / 3.4 * Math.PI * 2) * .005 : 1
	};
}
function pe(e) {
	return .06 + .94 * t(e);
}
//#endregion
//#region src/bot/expressions.ts
var I = (e, t, n = 0, r = 1) => ({
	w: e,
	h: t,
	tilt: n,
	open: r
}), L = (e, t, n = 0, r = 1) => [I(e, t, n, r), I(e, t, -n, r)], me = [
	{
		id: "neutre",
		gaze: { ...N },
		split: ie,
		eyes: [I(ae, oe), I(ae, oe)]
	},
	{
		id: "attentif",
		gaze: {
			yaw: 4,
			pitch: 5,
			roll: -4
		},
		split: 16,
		eyes: L(.21, .44)
	},
	{
		id: "surpris",
		gaze: {
			yaw: 3,
			pitch: -3,
			roll: 0
		},
		split: 19,
		eyes: L(.45, .47)
	},
	{
		id: "excite",
		gaze: {
			yaw: 6,
			pitch: -14,
			roll: 0
		},
		split: 19.5,
		eyes: L(.4, .56, -10)
	},
	{
		id: "heureux",
		gaze: {
			yaw: 5,
			pitch: 9,
			roll: 0
		},
		split: 17,
		eyes: L(.27, .17, 14)
	},
	{
		id: "hilare",
		gaze: {
			yaw: 4,
			pitch: 14,
			roll: 0
		},
		split: 18,
		eyes: L(.34, .13, 20)
	},
	{
		id: "colere",
		gaze: {
			yaw: 3,
			pitch: 7,
			roll: 0
		},
		split: 17,
		eyes: L(.34, .15, 30)
	},
	{
		id: "triste",
		gaze: {
			yaw: 3,
			pitch: -13,
			roll: 0
		},
		split: 16,
		eyes: L(.22, .4, -28)
	},
	{
		id: "effraye",
		gaze: {
			yaw: 2,
			pitch: -20,
			roll: 0
		},
		split: 20.5,
		eyes: L(.4, .6)
	},
	{
		id: "mefiant",
		gaze: {
			yaw: 12,
			pitch: 6,
			roll: -6
		},
		split: 16,
		eyes: [I(.21, .4), I(.22, .15)]
	},
	{
		id: "confus",
		gaze: {
			yaw: -14,
			pitch: 3,
			roll: 8
		},
		split: 16.5,
		eyes: [I(.2, .44, -18), I(.28, .17, 14)]
	},
	{
		id: "curieux",
		gaze: {
			yaw: 16,
			pitch: -9,
			roll: -15
		},
		split: 16.5,
		eyes: [I(.24, .46, -8), I(.2, .38, -8)]
	},
	{
		id: "fier",
		gaze: {
			yaw: 5,
			pitch: 17,
			roll: 0
		},
		split: 17,
		eyes: L(.3, .15, 18)
	},
	{
		id: "timide",
		gaze: {
			yaw: -19,
			pitch: -14,
			roll: -7
		},
		split: 14,
		eyes: L(.17, .3)
	},
	{
		id: "blase",
		gaze: {
			yaw: -22,
			pitch: 2,
			roll: 0
		},
		split: 16,
		eyes: L(.3, .12)
	},
	{
		id: "somnolent",
		gaze: {
			yaw: 6,
			pitch: -9,
			roll: -3
		},
		split: 16,
		eyes: L(.2, .42, 0, .42)
	}
], he = new Map(me.map((e) => [e.id, e])), ge = "neutre", _e = (e, t, r) => ({
	w: n(e.w, t.w, r),
	h: n(e.h, t.h, r),
	tilt: n(e.tilt ?? 0, t.tilt ?? 0, r),
	open: n(e.open, t.open, r)
});
function ve(e, t, r) {
	return {
		id: t.id,
		gaze: {
			yaw: n(e.gaze.yaw, t.gaze.yaw, r),
			pitch: n(e.gaze.pitch, t.gaze.pitch, r),
			roll: n(e.gaze.roll, t.gaze.roll, r)
		},
		split: n(e.split, t.split, r),
		eyes: [_e(e.eyes[0], t.eyes[0], r), _e(e.eyes[1], t.eyes[1], r)]
	};
}
//#endregion
//#region src/bot/decor.ts
function ye(e, t = .55, n = .62) {
	let r = (e % 360 + 360) % 360, i = (1 - Math.abs(2 * n - 1)) * t, a = i * (1 - Math.abs(r / 60 % 2 - 1)), o = n - i / 2, [s, c, l] = r < 60 ? [
		i,
		a,
		0
	] : r < 120 ? [
		a,
		i,
		0
	] : r < 180 ? [
		0,
		i,
		a
	] : r < 240 ? [
		0,
		a,
		i
	] : r < 300 ? [
		a,
		0,
		i
	] : [
		i,
		0,
		a
	], u = (e) => Math.round((e + o) * 255).toString(16).padStart(2, "0");
	return `#${u(s)}${u(c)}${u(l)}`;
}
function be(t, n, r, i, a = 1) {
	let s = t.phase + n * t.speed * e, c = Math.cos(t.tilt), l = Math.sin(t.tilt), u = Math.sqrt(Math.max(0, 1 - t.k * t.k)), d = t.sweep * e, f = "", p = "", m = null;
	for (let e = 0; e <= 64; e++) {
		let n = s + e / 64 * d, i = Math.cos(n), a = Math.sin(n), h = t.a * (i * c + a * -l * t.k) + t.cx, g = t.a * (i * l + a * c * t.k) + t.cy, _ = t.a * a * u < 0, v = o(h * r), y = o(g * r), b = _ === m ? "L" : "M";
		_ ? p += `${b}${v} ${y}` : f += `${b}${v} ${y}`, m = _;
	}
	let h = Math.cos(t.tilt) * t.a * r, g = Math.sin(t.tilt) * t.a * r;
	return {
		id: i,
		front: f,
		back: p,
		width: t.width * r,
		opacity: a,
		grad: {
			x1: o(t.cx * r - h),
			y1: o(t.cy * r - g),
			x2: o(t.cx * r + h),
			y2: o(t.cy * r + g),
			stops: [
				ye(t.hue),
				ye(t.hue + t.hueSpan * .5),
				ye(t.hue + t.hueSpan)
			]
		}
	};
}
var R = a(659918), xe = Array.from({ length: 6 }, (t, n) => ({
	a: 1.3 + R() * .1,
	k: .05 + R() * .4,
	tilt: n / 6 * Math.PI + R() * .5,
	speed: 3 + R() * .7,
	phase: R() * e,
	sweep: .6 + R() * .25,
	hue: n * 360 / 6 + R() * 30,
	hueSpan: 60 + R() * 60,
	width: .05 + R() * .012,
	cx: 0,
	cy: .1
})), Se = Array.from({ length: 4 }, (e, t) => ({
	a: .78 + t * .2,
	k: .05 + t * .02,
	tilt: -.62 + t * .05,
	speed: .3,
	phase: .06 * t,
	sweep: .4,
	hue: 95 + t * 62,
	hueSpan: 100,
	width: .05,
	cx: 0,
	cy: -.12
})), Ce = [
	-.557,
	-.013,
	.532
], we = .165, Te = 1.25, Ee = a(48879), De = Array.from({ length: 5 }, (t, n) => ({
	birth: n * .2,
	angle: Ee() * e,
	rho: .58 + Ee() * .18
}));
function Oe(e, n) {
	let r = [];
	for (let i of De) {
		let a = e - i.birth;
		if (a < 0 || a > .62) continue;
		let o = i.rho * .75 ** (a * 10), s = i.angle + a * 100 * Math.PI / 180;
		r.push({
			x: Math.cos(s) * o * n,
			y: Math.sin(s) * o * n,
			r: (.04 + .028 * t(a / .55)) * n,
			depth: t(1 - o / .8),
			opacity: t(a / .06) * t((.62 - a) / .08)
		});
	}
	return r;
}
var ke = a(49383), Ae = Array.from({ length: 4 }, (e, t) => {
	let n = t - 1.5;
	return {
		a: .85 * (1 + n * .03),
		k: .15 / .85 * (1 + n * .16),
		tilt: 34 * Math.PI / 180 + n * .035,
		speed: 210 / 360,
		phase: -t * .045 + ke() * .012,
		sweep: .34,
		hue: t * 85 + ke() * 20,
		hueSpan: 80,
		width: .095,
		cx: 0,
		cy: 0
	};
}), je = .129, Me = "#2496e8", Ne = 1.003, Pe = .15, Fe = 1.14, Ie = .054, Le = {
	egg: [
		.8369,
		.8424,
		.8497,
		.8585,
		.8674,
		.8775,
		.8878,
		.8983,
		.9089,
		.9185,
		.9288,
		.9374,
		.9445,
		.9504,
		.9543,
		.9559,
		.9555,
		.9519,
		.9466,
		.9389,
		.9302,
		.9193,
		.9085,
		.8969,
		.8852,
		.8734,
		.8625,
		.8513,
		.8411,
		.8325,
		.8243,
		.8179,
		.8137,
		.8112,
		.8102,
		.8128,
		.8178,
		.8262,
		.8374,
		.8518,
		.8702,
		.8922,
		.9169,
		.9446,
		.9741,
		1.0023,
		1.0267,
		1.0433,
		1.0481,
		1.0393,
		1.0216,
		.997,
		.9697,
		.9418,
		.9169,
		.8949,
		.876,
		.8604,
		.849,
		.8394,
		.8337,
		.8314,
		.8305,
		.8326
	],
	hexagon: [
		.921,
		.9282,
		.9441,
		.9706,
		.9984,
		1.0059,
		.9896,
		.9562,
		.929,
		.9124,
		.9047,
		.9058,
		.9157,
		.9349,
		.9642,
		.9873,
		.9882,
		.9665,
		.9336,
		.9105,
		.8968,
		.8918,
		.8955,
		.908,
		.9293,
		.9611,
		.982,
		.9812,
		.959,
		.9282,
		.9089,
		.8978,
		.8964,
		.9026,
		.9189,
		.9439,
		.9778,
		.999,
		.9964,
		.9713,
		.9439,
		.9274,
		.9196,
		.9206,
		.9308,
		.9502,
		.9799,
		1.0121,
		1.0226,
		1.0071,
		.9752,
		.951,
		.9366,
		.9316,
		.9351,
		.9485,
		.9711,
		1.0026,
		1.0213,
		1.0155,
		.9863,
		.9547,
		.9347,
		.9232
	],
	triangle: [
		.7819,
		.8211,
		.8747,
		.944,
		1.0223,
		1.096,
		1.1401,
		1.134,
		1.0808,
		1.0047,
		.9265,
		.8603,
		.8104,
		.773,
		.745,
		.7273,
		.7151,
		.7118,
		.7148,
		.7245,
		.7427,
		.768,
		.8037,
		.8518,
		.9148,
		.9876,
		1.0583,
		1.1073,
		1.1109,
		1.0667,
		.994,
		.9164,
		.8482,
		.7948,
		.7555,
		.7261,
		.7056,
		.6925,
		.6859,
		.6869,
		.6938,
		.7084,
		.7305,
		.7615,
		.804,
		.8595,
		.9311,
		1.0092,
		1.0791,
		1.1171,
		1.1054,
		1.0501,
		.9779,
		.905,
		.845,
		.799,
		.7656,
		.7413,
		.7258,
		.716,
		.7146,
		.7204,
		.733,
		.7528
	]
}, Re = Array.from({ length: 64 }, (t, n) => n / 64 * e), z = Re.map(Math.cos), B = Re.map(Math.sin);
function V(e, t = {}) {
	return {
		radii: [...Le[e]],
		rot: 0,
		cx: 0,
		cy: 0,
		sx: 1,
		sy: 1,
		...t
	};
}
function H(e, t = {}) {
	return {
		radii: Array(64).fill(e),
		rot: 0,
		cx: 0,
		cy: 0,
		sx: 1,
		sy: 1,
		...t
	};
}
function ze(t, r, i, a) {
	let o = a ?? {
		radii: Array(64),
		rot: 0,
		cx: 0,
		cy: 0,
		sx: 1,
		sy: 1
	};
	for (let e = 0; e < 64; e++) o.radii[e] = n(t.radii[e] ?? 1, r.radii[e] ?? 1, i);
	let s = r.rot - t.rot;
	for (; s > Math.PI;) s -= e;
	for (; s < -Math.PI;) s += e;
	return o.rot = t.rot + s * i, o.cx = n(t.cx, r.cx, i), o.cy = n(t.cy, r.cy, i), o.sx = n(t.sx, r.sx, i), o.sy = n(t.sy, r.sy, i), o;
}
function U(e, t, n = []) {
	let r = Math.cos(e.rot), i = Math.sin(e.rot);
	for (let a = 0; a < 64; a++) {
		let o = e.radii[a] ?? 1, s = o * (z[a] ?? 0), c = o * (B[a] ?? 0), l = s * r - c * i, u = s * i + c * r, d = n[a] ?? {
			x: 0,
			y: 0
		};
		d.x = (l * e.sx + e.cx) * t, d.y = (u * e.sy + e.cy) * t, n[a] = d;
	}
	return n.length = 64, n;
}
function Be(e, t = 1 / 6) {
	let n = e.length;
	if (n < 3) return "";
	let r = e[0], i = `M${o(r.x)} ${o(r.y)}`;
	for (let r = 0; r < n; r++) {
		let a = e[(r - 1 + n) % n], s = e[r], c = e[(r + 1) % n], l = e[(r + 2) % n], u = s.x + (c.x - a.x) * t, d = s.y + (c.y - a.y) * t, f = c.x - (l.x - s.x) * t, p = c.y - (l.y - s.y) * t;
		i += `C${o(u)} ${o(d)} ${o(f)} ${o(p)} ${o(c.x)} ${o(c.y)}`;
	}
	return `${i}Z`;
}
function W(e, t, n) {
	let r = Array(64).fill(0), i = e.length;
	for (let a = 0; a < 64; a++) {
		let o = z[a] ?? 0, s = B[a] ?? 0, c = 0;
		for (let r = 0; r < i; r++) {
			let a = e[r], l = e[(r + 1) % i], u = l.x - a.x, d = l.y - a.y, f = o * d - s * u;
			if (Math.abs(f) < 1e-9) continue;
			let p = a.x - t, m = a.y - n, h = (p * d - m * u) / f, g = (p * s - m * o) / f;
			h > c && g >= 0 && g <= 1 && (c = h);
		}
		r[a] = c;
	}
	return r;
}
function G(t, n, r, i, a, o, s = 96) {
	let c = i - t, l = a - n, u = Math.hypot(c, l) || 1e-6, d = Math.atan2(l, c), f = Math.acos(Math.max(-1, Math.min(1, (r - o) / u))), p = [];
	for (let i = 0; i <= s / 2; i++) {
		let a = d + f + (e - 2 * f) * i / (s / 2);
		p.push({
			x: t + Math.cos(a) * r,
			y: n + Math.sin(a) * r
		});
	}
	for (let e = 0; e <= s / 2; e++) {
		let t = d - f + 2 * f * e / (s / 2);
		p.push({
			x: i + Math.cos(t) * o,
			y: a + Math.sin(t) * o
		});
	}
	return p;
}
function K(t, r) {
	let i = t.length, a = (r / e % 1 + 1) % 1 * i, o = Math.floor(a);
	return n(t[o % i] ?? 1, t[(o + 1) % i] ?? 1, a - o);
}
function Ve(e, t = 1, n = 1) {
	return Re.map((r, i) => (Math.abs((z[i] ?? 0) / t) ** e + Math.abs((B[i] ?? 0) / n) ** e) ** (-1 / e));
}
function He(e) {
	let t = Array(64).fill(0);
	for (let n = 0; n < 64; n++) {
		let r = z[n] ?? 0, i = B[n] ?? 0, a = 0;
		for (let t of e) {
			let e = r * t.x + i * t.y, n = e * e - (t.x * t.x + t.y * t.y - t.r * t.r);
			if (n < 0) continue;
			let o = e + Math.sqrt(n);
			o > a && (a = o);
		}
		t[n] = a;
	}
	return t;
}
function Ue(t, n, r = 10) {
	let i = t.length, a = [], o = (e, t) => {
		let n = t.x - e.x, r = t.y - e.y, i = Math.hypot(n, r) || 1;
		return Math.atan2(-n / i, r / i);
	};
	for (let s = 0; s < i; s++) {
		let c = t[(s - 1 + i) % i], l = t[s], u = t[(s + 1) % i], d = o(c, l), f = o(l, u) - d;
		for (; f > Math.PI;) f -= e;
		for (; f < -Math.PI;) f += e;
		for (let e = 0; e <= r; e++) {
			let t = d + f * e / r;
			a.push({
				x: l.x + Math.cos(t) * n,
				y: l.y + Math.sin(t) * n
			});
		}
	}
	return a;
}
function We(t, n, r, i = 0) {
	let a = i * Math.PI / 180;
	return W(Ue(Array.from({ length: t }, (i, o) => {
		let s = a + o / t * e;
		return {
			x: Math.cos(s) * (n - r),
			y: Math.sin(s) * (n - r)
		};
	}), r), 0, 0);
}
function Ge(e, t = 1) {
	if (e.length < 3) return "";
	let n = "";
	for (let r = 0; r < e.length; r++) {
		let i = e[r];
		n += `${r === 0 ? "M" : "L"}${o(i.x * t)} ${o(i.y * t)}`;
	}
	return `${n}Z`;
}
function Ke(e, t) {
	let n = Math.max(e, .01) / 2, r = Math.max(t, .01) / 2, i = Math.min(n, r);
	return `M${o(-n)} ${o(-r + i)}A${o(i)} ${o(i)} 0 0 1 ${o(-n + i)} ${o(-r)}L${o(n - i)} ${o(-r)}A${o(i)} ${o(i)} 0 0 1 ${o(n)} ${o(-r + i)}L${o(n)} ${o(r - i)}A${o(i)} ${o(i)} 0 0 1 ${o(n - i)} ${o(r)}L${o(-n + i)} ${o(r)}A${o(i)} ${o(i)} 0 0 1 ${o(-n)} ${o(r - i)}Z`;
}
//#endregion
//#region src/bot/skins.ts
function q(e, t = 1) {
	let n = Math.max(...e);
	if (n <= 0) return e;
	let r = t / n;
	return e.map((e) => e * r);
}
var qe = q(Array.from({ length: 64 }, (e, t) => t / 64 * Math.PI * 2).map((e) => 1 + .075 * Math.cos(2 * e + .5) + .035 * Math.cos(3 * e + 2.1)), 1.02), Je = q(He([
	{
		x: -.44,
		y: .2,
		r: .54
	},
	{
		x: .46,
		y: .2,
		r: .5
	},
	{
		x: .02,
		y: .3,
		r: .6
	},
	{
		x: -.24,
		y: -.3,
		r: .48
	},
	{
		x: .3,
		y: -.24,
		r: .44
	}
]), 1.02), Ye = q(He([{
	x: -.05,
	y: -.04,
	r: .98
}]), 1.02), Xe = q(W(G(0, .28, .66, 0, -.96, .05), 0, 0), 1.04), Ze = W(G(-.42, 0, .62, .42, 0, .62), 0, 0), Qe = [
	{
		id: "kumo",
		radii: Ye,
		attachments: u.map((e) => ({ ...e })),
		eyeColor: "#111318"
	},
	{
		id: "cercle",
		radii: Array(64).fill(1)
	},
	{
		id: "galet",
		radii: qe
	},
	{
		id: "squircle",
		radii: q(Ve(4.2), 1.15)
	},
	{
		id: "capsule",
		radii: Ze
	},
	{
		id: "triangle",
		radii: We(3, 1.12, .34, -90)
	},
	{
		id: "hexagone",
		radii: We(6, 1.04, .26, 0)
	},
	{
		id: "nuage",
		radii: Je
	},
	{
		id: "goutte",
		radii: Xe
	}
], $e = new Map(Qe.map((e) => [e.id, e]));
new Map([
	{
		id: "kumo",
		hex: "#d9d9d9"
	},
	{
		id: "encre",
		hex: "#0a0a0c"
	},
	{
		id: "brun",
		hex: "#8b5e3c"
	},
	{
		id: "rouge",
		hex: "#e8483f"
	},
	{
		id: "orange",
		hex: "#f08a24"
	},
	{
		id: "ambre",
		hex: "#f0b429"
	},
	{
		id: "vert",
		hex: "#3ecf8e"
	},
	{
		id: "turquoise",
		hex: "#2fbfa0"
	},
	{
		id: "bleu",
		hex: "#3b93f0"
	},
	{
		id: "violet",
		hex: "#8b5cf6"
	},
	{
		id: "rose",
		hex: "#e152b0"
	},
	{
		id: "gris",
		hex: "#a3a3a3"
	},
	{
		id: "creme",
		hex: "#f1efe9"
	}
].map((e) => [e.id, e]));
function et(e, t, n) {
	let r = (e) => {
		let t = parseInt(e.slice(1), 16);
		return [
			t >> 16 & 255,
			t >> 8 & 255,
			t & 255
		];
	}, i = r(e), a = r(t);
	return `#${i.map((e, t) => Math.round(e + (a[t] - e) * n)).map((e) => e.toString(16).padStart(2, "0")).join("")}`;
}
//#endregion
//#region src/bot/states.ts
var J = (e, t) => [{
	w: e,
	h: t,
	open: 1
}, {
	w: e,
	h: t,
	open: 1
}];
function Y(e = {}) {
	return {
		sil: H(1),
		offX: 0,
		offY: 0,
		gaze: { ...N },
		split: ie,
		eyes: J(ae, oe),
		eyeAlpha: 1,
		bodyAlpha: 1,
		dots: [],
		arcs: [],
		notif: null,
		dotsBehind: !1,
		...e
	};
}
var tt = -.1875, nt = W(G(0, -.505, .132, 0, .13, .075), 0, tt), rt = W(G(0, -.2535, .1345, 0, .2535, .1345), 0, 0), it = (e = {}) => ({
	radii: [...nt],
	rot: 0,
	cx: 0,
	cy: tt,
	sx: 1,
	sy: 1,
	...e
}), at = (e = {}) => ({
	radii: [...rt],
	rot: 0,
	cx: 0,
	cy: 0,
	sx: 1,
	sy: 1,
	...e
}), ot = Ge(G(0, 0, .118, 0, .172, .012)), st = .213;
function ct(e) {
	return V("triangle", {
		rot: e,
		cx: -.213 * Math.sin(e),
		cy: st * Math.cos(e)
	});
}
function lt(n, r) {
	let i = ((n - r * .5) / 1.5 % 1 + 1) % 1;
	return t((i < .5 ? .5 - .5 * Math.cos(i * e) : 0) * 2);
}
var ut = [
	{
		id: "idle",
		duration: 2.4,
		morph: .45,
		blinkIn: !1,
		baseFace: !0,
		baseBody: !0,
		pose: () => Y()
	},
	{
		id: "thinking",
		duration: 2.6,
		morph: .4,
		baseFace: !1,
		baseBody: !1,
		blinkIn: !0,
		pose: (e) => {
			let n = lt(e, 1), i = .3 + .7 * r.easeOutCubic(t(e / .3));
			return Y({
				sil: H(we * (1 + (Te - 1) * n), { cx: Ce[1] }),
				eyeAlpha: 0,
				dots: [0, 2].map((t) => {
					let n = lt(e, t);
					return {
						x: Ce[t] * i,
						y: 0,
						r: we * (1 + (Te - 1) * n),
						opacity: .55 + .45 * n
					};
				})
			});
		}
	},
	{
		id: "wink",
		duration: 1.6,
		morph: .3,
		blinkIn: !0,
		baseFace: !1,
		baseBody: !0,
		pose: () => Y({
			gaze: {
				yaw: -5.37,
				pitch: 4.55,
				roll: 6.7
			},
			split: 16.25,
			eyes: [{
				w: .236,
				h: .464,
				open: 1
			}, {
				w: .447,
				h: .089,
				open: 1
			}]
		})
	},
	{
		id: "wide",
		duration: 1.8,
		morph: .55,
		blinkIn: !0,
		baseFace: !1,
		baseBody: !0,
		pose: () => Y({
			gaze: {
				yaw: 6.92,
				pitch: -21.96,
				roll: 11.6
			},
			split: 18.43,
			eyes: J(.356, .875)
		})
	},
	{
		id: "alert",
		duration: 2.4,
		minDuration: 2,
		morph: .45,
		baseFace: !1,
		baseBody: !1,
		blinkIn: !1,
		pose: (n) => {
			let i = t(n / 1.5), a = r.easeInOutCubic(i) * .82 - .087, o = n > 1.6 ? t((n - 1.6) / .4) : 0, s = a * (1 - o) + .1 * o, c = Math.sin(n * 2.5 * e) * .005, l = 17.7 * Math.PI / 180;
			return Y({
				sil: at({
					rot: l,
					cx: s,
					cy: -.325 - c
				}),
				eyeAlpha: 0,
				dots: [{
					x: s - Math.sin(l) * .58,
					y: -.325 + Math.cos(l) * .58 + c * 2.8,
					r: .118,
					d: ot,
					rot: l * 180 / Math.PI,
					opacity: 1
				}]
			});
		}
	},
	{
		id: "notify",
		duration: 2.2,
		morph: .5,
		blinkIn: !0,
		baseFace: !1,
		baseBody: !0,
		pose: (e) => {
			let n = t(e / .45), r = 1 + (Fe - 1) * Math.sin(n * Math.PI) * (1 - n * .35), i = Pe * (n < 1 ? r : 1), a = -42 * Math.PI / 180;
			return Y({
				gaze: {
					yaw: -21.94,
					pitch: -5.82,
					roll: -12.2
				},
				split: 18.89,
				eyes: J(.505, .498),
				notif: {
					x: Math.cos(a) * Ne,
					y: Math.sin(a) * Ne,
					r: i,
					notch: i + Ie
				}
			});
		}
	},
	{
		id: "exclaim",
		duration: 2,
		morph: .45,
		baseFace: !1,
		baseBody: !1,
		blinkIn: !1,
		pose: () => Y({
			sil: it(),
			eyeAlpha: 0,
			dots: [{
				x: -.012,
				y: .526,
				r: .113,
				opacity: 1
			}]
		})
	},
	{
		id: "sleep",
		duration: 2.4,
		morph: .5,
		baseFace: !1,
		baseBody: !1,
		blinkIn: !1,
		pose: (t) => Y({
			sil: H(.1585, { cy: .11 + Math.sin(e / .6 * t) * .19 }),
			eyeAlpha: 0
		})
	},
	{
		id: "egg",
		duration: 1.8,
		morph: .4,
		baseFace: !1,
		baseBody: !1,
		blinkIn: !0,
		pose: () => Y({
			sil: V("egg"),
			gaze: {
				yaw: 19.97,
				pitch: 26.01,
				roll: -17.1
			},
			split: 11.07,
			eyes: J(.164, .385)
		})
	},
	{
		id: "hexagon",
		duration: 1.6,
		morph: .4,
		baseFace: !1,
		baseBody: !1,
		blinkIn: !0,
		pose: () => Y({
			sil: V("hexagon"),
			gaze: {
				yaw: 23.11,
				pitch: 24.42,
				roll: -13.3
			},
			split: 13.37,
			eyes: J(.177, .411)
		})
	},
	{
		id: "play",
		duration: 2,
		morph: .5,
		baseFace: !1,
		baseBody: !1,
		blinkIn: !0,
		pose: (e) => {
			let n = t(e / .35) * t((2.2 - e) / .5);
			return Y({
				sil: ct(0),
				gaze: {
					yaw: 12,
					pitch: -8,
					roll: -6
				},
				split: 15,
				eyes: J(.18, .34),
				arcs: Se.map((t, r) => ({
					id: `sw${r}`,
					seed: {
						...t,
						cx: .45 - e * .42
					},
					t: e,
					opacity: n
				}))
			});
		}
	},
	{
		id: "orbit",
		duration: 3.4,
		minDuration: 2.5,
		morph: .6,
		baseFace: !1,
		baseBody: !1,
		blinkIn: !1,
		pose: (n) => {
			let i = r.easeInOutCubic(t(n / .35)), a = -e * 1.25 * n * i, o = r.easeInOutCubic(t((n - 1.6) / .9)), s = ct(a), c = H(1, { rot: a }), l = {
				radii: s.radii.map((e, t) => e + (c.radii[t] - e) * o),
				rot: a,
				cx: s.cx * (1 - o),
				cy: s.cy * (1 - o),
				sx: 1,
				sy: 1
			}, u = t(n / .8) * t((3.6 - n) / .9);
			return Y({
				sil: l,
				gaze: {
					yaw: N.yaw + Math.sin(n * 6.5) * 65 * (1 - o),
					pitch: -4 + o * 32,
					roll: -13
				},
				eyes: J(.18, .34 + o * .07),
				arcs: xe.map((e, r) => ({
					id: `rg${r}`,
					seed: e,
					t: n,
					opacity: u * t((n - r * .13) / .3)
				}))
			});
		}
	},
	{
		id: "swirl",
		duration: 1.3,
		minDuration: 1.3,
		morph: .3,
		baseFace: !0,
		baseBody: !0,
		blinkIn: !0,
		pose: (e) => Y({ arcs: xe.slice(0, 3).map((n, r) => ({
			id: `sw${r}`,
			seed: n,
			t: e,
			opacity: t((e - r * .06) / .14) * t((1.22 - e) / .34)
		})) })
	},
	{
		id: "burst",
		duration: 2.6,
		minDuration: 2.4,
		morph: .4,
		baseFace: !1,
		baseBody: !1,
		blinkIn: !1,
		pose: (e) => {
			let n = 1 - .834 * r.easeOutQuint(t(e / .7)), i = r.easeOutQuint(t((e - 1.7) / .7));
			return Y({
				sil: H(n + (1 - n) * i),
				eyeAlpha: t((e - 1.85) / .4),
				dots: Oe(e, 1),
				dotsBehind: !0
			});
		}
	},
	{
		id: "comet",
		duration: 2.4,
		minDuration: 2.4,
		morph: .45,
		baseFace: !1,
		baseBody: !1,
		blinkIn: !1,
		pose: (e) => {
			let n = 1 - (1 - je) * r.easeOutQuint(t(e / .55)), i = r.easeOutQuint(t((e - 1.85) / .6)), a = t((e - .15) / .25) * t((1.95 - e) / .3);
			return Y({
				sil: H(n + (1 - n) * i, { cy: Math.sin(t(e / 1.7) * Math.PI) * .035 }),
				eyeAlpha: t((e - 2) / .35),
				arcs: Ae.map((t, n) => ({
					id: `cm${n}`,
					seed: t,
					t: e,
					opacity: a
				}))
			});
		}
	}
], X = new Map(ut.map((e) => [e.id, e])), Z = 100, dt = 7.1, ft = 5.5, pt = .006, mt = .007;
function ht(e, t, n) {
	let r = [], i = se(e.gaze, Z, e.split);
	for (let a = 0; a < 2; a++) {
		let o = i[a];
		if (o.depth <= .02) continue;
		let s = e.eyes[a], c = (s.tilt ?? 0) * Math.PI / 180, l = Math.cos(c), u = Math.sin(c), d = o.a * l + o.c * u, f = o.b * l + o.d * u, p = -o.a * u + o.c * l, m = -o.b * u + o.d * l, h = Math.max(s.w * Z, .01) / 2, g = Math.max(s.h * Z, .01) / 2, _ = Math.min(h, g), v = g > h, y = v ? g - _ : h - _, b = K(n, Math.atan2(o.y, o.x) - t.rot);
		r.push({
			x: o.x * b,
			y: o.y * b,
			ax: (v ? p : d) * y,
			ay: (v ? m : f) * y,
			r: _,
			m: [
				d,
				f,
				p,
				m
			]
		});
	}
	return r;
}
function gt(e, t, n, r, i) {
	let a = r - t, o = i - n, s = a * a + o * o, c = Infinity, l = 0, u = 0;
	for (let r = 0; r < e.length; r++) {
		let i = e[r], d = s > 0 ? ((i.x - t) * a + (i.y - n) * o) / s : 0;
		d = d < 0 ? 0 : d > 1 ? 1 : d;
		let f = t + d * a - i.x, p = n + d * o - i.y, m = f * f + p * p;
		m < c && (c = m, l = f, u = p);
	}
	let d = Math.sqrt(c);
	return {
		d,
		ux: d > 1e-9 ? l / d : 0,
		uy: d > 1e-9 ? u / d : 0
	};
}
var _t = Math.hypot(pt, mt) * Z;
function vt(e, t, n, r) {
	let i = Infinity, a = 0, o = 0;
	for (let s of t) {
		let t = s.x + n, c = s.y + r, l = gt(e, t - s.ax, c - s.ay, t + s.ax, c + s.ay), [u, d, f, p] = s.m, m = s.r * Math.hypot(u * l.ux + d * l.uy, f * l.ux + p * l.uy) + _t;
		l.d - m < i && (i = l.d - m, a = l.ux, o = l.uy);
	}
	return {
		marge: i,
		ux: a,
		uy: o
	};
}
var yt = 12, bt = 8;
function xt(e) {
	if (!e.length) return {
		x: 0,
		y: 0
	};
	let t = (t, n) => {
		let r = Infinity;
		for (let i of e) r = Math.min(r, vt(i.contour, i.empreintes, t, n).marge);
		return r;
	}, n = Infinity;
	for (let t of e) n = Math.min(n, vt(t.calContour, t.reference, 0, 0).marge);
	let r = 0, i = 0, a = e[0].empreintes;
	for (let e of a) r -= e.x / a.length, i -= e.y / a.length;
	let o = Math.max(.35 * Z, Math.hypot(r, i) * 1.25);
	n = Math.min(n, t(r, i));
	let s = t(0, 0);
	if (s >= n && s >= 0) return {
		x: 0,
		y: 0
	};
	let c = Math.max(n, 0), l = 0, u = 0, d = Infinity, f = 0, p = 0, m = s;
	for (let e = 0; e < yt; e++) {
		let n = e / yt * Math.PI * 2, r = Math.cos(n), i = Math.sin(n);
		if (t(r * o, i * o) < c) {
			for (let e of [
				.3,
				.6,
				1
			]) {
				let n = t(r * o * e, i * o * e);
				n > m && (m = n, f = r * o * e, p = i * o * e);
			}
			continue;
		}
		let a = 0, s = o;
		for (let e = 0; e < bt; e++) {
			let e = (a + s) / 2;
			t(r * e, i * e) >= c ? s = e : a = e;
		}
		s < d && (d = s, l = r * s, u = i * s);
	}
	let h = d === Infinity ? f : l, g = d === Infinity ? p : u;
	return {
		x: +(h / Z).toFixed(6),
		y: +(g / Z).toFixed(6)
	};
}
function St(e, t, n) {
	return e.baseFace && n ? {
		gaze: n.gaze,
		split: n.split,
		eyes: n.eyes
	} : {
		gaze: t.gaze,
		split: t.split,
		eyes: t.eyes
	};
}
function Ct(e) {
	let t = (e) => JSON.stringify([
		e.gaze,
		e.split,
		e.eyes,
		e.sil.rot,
		e.sil.cx,
		e.sil.cy,
		e.sil.sx,
		e.sil.sy
	]);
	return t(e.pose(0)) === t(e.pose(e.duration)) ? [0] : Array.from({ length: 3 }, (t, n) => n / 2 * e.duration);
}
function wt(e, t, n) {
	let r = [];
	for (let i of Ct(e)) {
		let a = e.pose(i), o = U({
			...a.sil,
			radii: t
		}, Z), s = U(a.sil, Z), c = St(e, a, n), l = [];
		for (let e of [-7.1, dt]) for (let t of [-5.5, ft]) l.push({
			...c,
			gaze: {
				yaw: c.gaze.yaw + e,
				pitch: c.gaze.pitch + t,
				roll: c.gaze.roll
			}
		});
		for (let e of l) r.push({
			empreintes: ht(e, a.sil, t),
			reference: ht(e, a.sil, a.sil.radii),
			contour: o,
			calContour: s
		});
	}
	return xt(r);
}
var Tt = {
	x: 0,
	y: 0
}, Et = (e, t) => `${e}|${t ?? ""}`;
function Dt() {
	return new Map(Qe.map((e) => {
		let t = /* @__PURE__ */ new Map();
		for (let n of ut) {
			if (!n.baseBody) continue;
			let r = n.baseFace ? [null, ...me] : [null];
			for (let i of r) t.set(Et(n.id, i?.id ?? null), wt(n, e.radii, i));
		}
		return [e.radii, t];
	}));
}
var Ot = Dt();
function kt(e, t, n) {
	if (!e) return Tt;
	let r = Ot.get(e);
	return r ? r.get(Et(t, n)) ?? r.get(Et(t, null)) ?? Tt : Tt;
}
//#endregion
//#region src/bot/engine.ts
var At = {
	yaw: 0,
	pitch: 0,
	mix: 0,
	spin: 0,
	wander: 1
}, jt = (e, t, r) => ({
	yaw: n(e.yaw, t.yaw, r),
	pitch: n(e.pitch, t.pitch, r),
	mix: n(e.mix, t.mix, r),
	spin: n(e.spin, t.spin, r),
	wander: n(e.wander, t.wander, r)
}), Mt = (e, t, r) => ({
	w: n(e.w, t.w, r),
	h: n(e.h, t.h, r),
	open: n(e.open, t.open, r),
	tilt: n(e.tilt ?? 0, t.tilt ?? 0, r)
});
function Nt(e, t, r) {
	let i = 1 - r;
	return {
		sil: ze(e.sil, t.sil, r),
		offX: n(e.offX, t.offX, r),
		offY: n(e.offY, t.offY, r),
		gaze: {
			yaw: n(e.gaze.yaw, t.gaze.yaw, r),
			pitch: n(e.gaze.pitch, t.gaze.pitch, r),
			roll: n(e.gaze.roll, t.gaze.roll, r)
		},
		split: n(e.split, t.split, r),
		eyes: [Mt(e.eyes[0], t.eyes[0], r), Mt(e.eyes[1], t.eyes[1], r)],
		eyeAlpha: n(e.eyeAlpha, t.eyeAlpha, r),
		bodyAlpha: n(e.bodyAlpha, t.bodyAlpha, r),
		dots: [...e.dots.map((e) => ({
			...e,
			opacity: e.opacity * i
		})), ...t.dots.map((e) => ({
			...e,
			opacity: e.opacity * r
		}))],
		arcs: [...e.arcs.map((e) => ({
			...e,
			id: `a${e.id}`,
			opacity: e.opacity * i
		})), ...t.arcs.map((e) => ({
			...e,
			id: `b${e.id}`,
			opacity: e.opacity * r
		}))],
		notif: r < .5 ? e.notif : t.notif,
		dotsBehind: r < .5 ? e.dotsBehind : t.dotsBehind
	};
}
var Pt = class e {
	scale;
	cur;
	prev = null;
	departFige = null;
	tCur = 0;
	tPrev = 0;
	blinkAt = -10;
	pts = [];
	shape = null;
	shapePrev = null;
	shapeAt = -10;
	expr = null;
	exprPrev = null;
	exprAt = -10;
	look = At;
	lookPrev = At;
	lookAt = -10;
	lookMorph = .24;
	static SHAPE_MORPH = .45;
	static LOOK_MORPH = .24;
	constructor(e = 100, t = "idle", n = null, r = null) {
		this.scale = e, this.cur = t, this.shape = n, this.expr = r;
	}
	setExpression(e, t = 0) {
		e !== this.expr && (this.exprPrev = this.expr, this.expr = e, this.exprAt = t);
	}
	exprAtTime(n) {
		let i = this.expr, a = this.exprPrev;
		if (!i || !a) return i;
		let o = (n - this.exprAt) / e.SHAPE_MORPH;
		return o >= 1 ? i : ve(a, i, r.easeOutQuint(t(o)));
	}
	setShape(e, t = 0) {
		e !== this.shape && (this.shapePrev = this.shape, this.shape = e, this.shapeAt = t);
	}
	shapeAtTime(i) {
		let a = this.shape, o = this.shapePrev;
		if (!a || !o) return a;
		let s = (i - this.shapeAt) / e.SHAPE_MORPH;
		if (s >= 1) return a;
		let c = r.easeOutQuint(t(s));
		return a.map((e, t) => n(o[t] ?? e, e, c));
	}
	setLook(t, n, r = e.LOOK_MORPH) {
		t && !Number.isFinite(t.yaw + t.pitch + t.mix + t.spin + t.wander) || (this.lookPrev = this.lookAtTime(n), this.look = t ?? At, this.lookAt = n, this.lookMorph = r);
	}
	lookAtTime(e) {
		let n = (e - this.lookAt) / this.lookMorph;
		return n >= 1 ? this.look : jt(this.lookPrev, this.look, r.easeOutQuint(t(n)));
	}
	posed(e, t, n, r) {
		let i = e.pose(t);
		return e.baseBody && n && (i = {
			...i,
			sil: {
				...i.sil,
				radii: n
			}
		}), e.baseFace && r && (i = {
			...i,
			gaze: r.gaze,
			split: r.split,
			eyes: r.eyes
		}), i;
	}
	decalageAtTime(i, a) {
		let o = (e, a, o, s) => {
			if (o === s) return s;
			let c = (i - e) / a;
			if (c >= 1) return s;
			let l = r.easeOutQuint(t(c));
			return {
				x: n(o.x, s.x, l),
				y: n(o.y, s.y, l)
			};
		}, s = (t) => o(this.exprAt, e.SHAPE_MORPH, kt(t, a, this.exprPrev?.id ?? null), kt(t, a, this.expr?.id ?? null));
		return o(this.shapeAt, e.SHAPE_MORPH, s(this.shapePrev), s(this.shape));
	}
	get state() {
		return this.cur;
	}
	reset(e, t) {
		this.cur = e, this.prev = null, this.departFige = null, this.tCur = t, this.tPrev = t, this.blinkAt = -10;
	}
	origine(e, t, n) {
		if (this.departFige) return this.departFige;
		if (!this.prev) return null;
		let r = X.get(this.prev);
		return this.posed(r, Math.max(0, e - this.tPrev), t, n);
	}
	poseComposee(e) {
		let n = X.get(this.cur), i = this.shapeAtTime(e), a = this.exprAtTime(e), o = this.posed(n, Math.max(0, e - this.tCur), i, a), s = e - this.tCur;
		if (s >= n.morph) return o;
		let c = this.origine(e, i, a);
		return c ? Nt(c, o, r.easeOutQuint(t(s / n.morph))) : o;
	}
	setState(e, t) {
		if (e === this.cur) return;
		let n = X.get(this.cur).morph, r = this.prev !== null && t - this.tCur < n;
		this.departFige = r ? this.poseComposee(t) : null, this.prev = this.cur, this.tPrev = this.tCur, this.cur = e, this.tCur = t, X.get(e)?.blinkIn && (this.blinkAt = t);
	}
	sample(e) {
		let i = this.scale, a = X.get(this.cur), s = this.shapeAtTime(e), c = this.exprAtTime(e), l = this.posed(a, Math.max(0, e - this.tCur), s, c), u = this.decalageAtTime(e, this.cur), d = e - this.tCur, f = d < a.morph ? this.origine(e, s, c) : null;
		if (f) {
			let i = r.easeOutQuint(t(d / a.morph));
			l = Nt(f, l, i);
			let o = this.prev;
			if (o) {
				let t = this.decalageAtTime(e, o);
				u = {
					x: n(t.x, u.x, i),
					y: n(t.y, u.y, i)
				};
			}
		}
		let p = l.eyeAlpha > .01, m = this.lookAtTime(e), h = fe(e, {
			wander: p ? m.wander : 0,
			blink: p
		}), g = {
			yaw: n(l.gaze.yaw, m.yaw, m.mix) + h.dYaw - m.spin,
			pitch: n(l.gaze.pitch, m.pitch, m.mix) + h.dPitch,
			roll: l.gaze.roll + h.dRoll
		}, _ = t((e - this.blinkAt) / .2), v = _ < 1 ? Math.abs(_ * 2 - 1) : 1, y = Math.min(h.lid, v), b = l.offX + h.driftX, x = l.offY + h.driftY, S = {
			...l.sil,
			cx: l.sil.cx + b,
			cy: l.sil.cy + x,
			sy: l.sil.sy * h.breath
		}, C = Be(U(S, i, this.pts)), w = (e, t) => K(l.sil.radii, Math.atan2(t, e) - l.sil.rot), T = [];
		if (l.eyeAlpha > .01) {
			let e = se(g, i, l.split);
			for (let n = 0; n < 2; n++) {
				let r = e[n];
				if (r.depth <= .02) continue;
				let a = l.eyes[n], s = w(r.x, r.y), c = (a.tilt ?? 0) * Math.PI / 180, d = Math.cos(c), f = Math.sin(c), p = r.a * d + r.c * f, m = r.b * d + r.d * f, h = -r.a * f + r.c * d, g = -r.b * f + r.d * d, _ = pe(Math.min(y, a.open));
				T.push({
					d: Ke(a.w * i, a.h * i),
					matrix: `matrix(${o(p)},${o(m * _)},${o(h)},${o(g * _)},${o(r.x * s + (b + u.x) * i)},${o(r.y * s + (x + u.y) * i)})`,
					alpha: l.eyeAlpha * t(r.depth / .12)
				});
			}
		}
		let E = l.dots.filter((e) => e.opacity > .01 && e.r > 5e-4).map((e) => ({
			...e,
			x: (e.x + b) * i,
			y: (e.y + x) * i,
			r: e.r * i
		})), D = l.notif ? w(l.notif.x, l.notif.y) : 1, O = l.notif ? (l.notif.x * D + b) * i : 0, k = l.notif ? (l.notif.y * D + x) * i : 0, A = l.notif ? {
			x: O,
			y: k,
			r: l.notif.r * i
		} : null, j = l.notif ? {
			x: O,
			y: k,
			r: l.notif.notch * i
		} : null;
		return {
			bodyPath: C,
			bodyAlpha: l.bodyAlpha,
			bodyTransform: {
				x: S.cx * i,
				y: S.cy * i,
				rotation: S.rot * 180 / Math.PI,
				sx: S.sx,
				sy: S.sy
			},
			eyes: T,
			dots: E,
			dotsBehind: l.dotsBehind,
			arcs: l.arcs.filter((e) => e.opacity > .01).map((e) => be(e.seed, e.t, i, e.id, e.opacity)),
			notif: A,
			notch: j
		};
	}
}, Ft = 1.5, It = (e) => ({
	yaw: 0,
	pitch: 0,
	mix: 0,
	spin: 360 * (1 - r.easeInOutCubic(t(e / Ft))),
	wander: 1
}), Lt = "http://www.w3.org/2000/svg", Rt = "#d9d9d9", zt = "#f9f9f9", Bt = [
	"idle",
	"loading",
	"success",
	"error",
	"attention",
	"hover"
], Vt = [
	"stretch",
	"scuttle",
	"curl"
], Ht = {
	rainbow: "startup",
	start: "startup"
}, Ut = 0, Wt = {
	neutral: "neutre",
	attentive: "attentif",
	surprised: "surpris",
	excited: "excite",
	happy: "heureux",
	laughing: "hilare",
	angry: "colere",
	sad: "triste",
	frightened: "effraye",
	wary: "mefiant",
	confused: "confus",
	curious: "curieux",
	proud: "fier",
	shy: "timide",
	bored: "blase",
	sleepy: "somnolent"
}, Gt = {
	stretch: {
		rhythm: "breathe",
		start: 3.15,
		duration: 1.55
	},
	scuttle: {
		rhythm: "skitter",
		start: 1.95,
		duration: 1.15
	},
	curl: {
		rhythm: "doze",
		start: 3.85,
		duration: 2.15
	}
}, Q = (e) => document.createElementNS(Lt, e), Kt = (e, t) => typeof e == "number" && Number.isFinite(e) ? e : t, qt = (e, t) => typeof e == "string" && /^#[0-9a-f]{6}$/i.test(e) ? e.toLowerCase() : t, Jt = (e) => 1 - (1 - t(e)) ** 4;
function $(e) {
	let t = (e ?? "neutre").toLowerCase();
	return he.get(Wt[t] ?? t) ?? he.get("neutre");
}
var Yt = class extends HTMLElement {
	static observedAttributes = [
		"color",
		"config",
		"context",
		"expression",
		"follow-pointer"
	];
	shadow;
	svg = Q("svg");
	defs = Q("defs");
	mask = Q("mask");
	maskBody = Q("path");
	maskEyes = [Q("path"), Q("path")];
	maskNotch = Q("circle");
	backArcs = Q("g");
	dotsBehind = Q("g");
	scene = Q("g");
	legsGroup = Q("g");
	bodyPaper = Q("path");
	body = Q("path");
	eyesGroup = Q("g");
	eyeNodes = [Q("path"), Q("path")];
	dotsFront = Q("g");
	notification = Q("circle");
	frontArcs = Q("g");
	legNodes = [];
	uid = `kumo-runtime-${++Ut}`;
	maskId = `${this.uid}-mask`;
	design = g(d);
	motion = _(f);
	attachments = [];
	bodyRadii = [];
	idleBodyPath = "";
	color = Rt;
	paper = zt;
	baseExpression = $(ge);
	expressionFrom = this.baseExpression;
	expressionTo = this.baseExpression;
	expressionChangedAt = 0;
	expressionDuration = 360;
	context = "idle";
	configuredFollowPointer = !1;
	pointerFollowing = !1;
	pointerTarget = null;
	manualTarget = null;
	currentLook = {
		x: 0,
		y: 0,
		mix: 0
	};
	activeBreak = null;
	activeAnimation = null;
	sequenceToken = 0;
	viewBoxHalf = 158;
	startedAt = 0;
	previousAt = 0;
	raf = 0;
	reduceMotion = !1;
	connected = !1;
	reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
	constructor() {
		super(), this.shadow = this.attachShadow({ mode: "open" });
		let e = document.createElement("style");
		e.textContent = "\n      :host { display: inline-block; width: 280px; max-width: 100%; aspect-ratio: 1; contain: layout style; }\n      svg { display: block; width: 100%; height: 100%; overflow: visible; }\n    ", this.svg.setAttribute("width", "100%"), this.svg.setAttribute("height", "100%"), this.svg.setAttribute("preserveAspectRatio", "xMidYMid meet"), this.svg.setAttribute("role", "img"), this.svg.setAttribute("aria-label", this.getAttribute("aria-label") ?? "Animated Kumo logo"), this.mask.setAttribute("id", this.maskId), this.mask.setAttribute("maskUnits", "userSpaceOnUse"), this.maskBody.setAttribute("fill", "#fff"), this.maskEyes.forEach((e) => {
			e.setAttribute("fill", "#000"), this.mask.append(e);
		}), this.maskNotch.setAttribute("fill", "#000"), this.mask.append(this.maskBody, ...this.maskEyes, this.maskNotch), this.defs.append(this.mask), this.backArcs.setAttribute("fill", "none"), this.backArcs.setAttribute("stroke-linecap", "round"), this.frontArcs.setAttribute("fill", "none"), this.frontArcs.setAttribute("stroke-linecap", "round"), this.body.setAttribute("data-kumo-body", ""), this.body.setAttribute("mask", `url(#${this.maskId})`), this.eyeNodes.forEach((e, t) => {
			e.setAttribute("data-kumo-eye", String(t)), this.eyesGroup.append(e);
		}), this.notification.setAttribute("fill", Me), this.scene.append(this.legsGroup, this.bodyPaper, this.body, this.eyesGroup), this.svg.append(this.defs, this.backArcs, this.dotsBehind, this.scene, this.dotsFront, this.notification, this.frontArcs), this.shadow.append(e, this.svg), this.updateGeometry();
	}
	connectedCallback() {
		this.connected || (this.connected = !0, this.reduceMotion = this.reducedMotionQuery.matches, this.reducedMotionQuery.addEventListener("change", this.onReducedMotion), this.startedAt = performance.now(), this.previousAt = this.startedAt, this.syncPointerListener(), this.raf = requestAnimationFrame(this.tick), this.dispatchEvent(new CustomEvent("kumo-ready", { bubbles: !0 })));
	}
	disconnectedCallback() {
		this.connected = !1, cancelAnimationFrame(this.raf), this.cancelAnimation("disconnected"), this.reducedMotionQuery.removeEventListener("change", this.onReducedMotion), this.detachPointerListener();
	}
	attributeChangedCallback(e, t, n) {
		if (e === "config" && n) {
			try {
				this.configure(JSON.parse(n));
			} catch {}
			return;
		}
		if (e === "color") {
			this.configure({ color: n ?? Rt });
			return;
		}
		if (e === "expression" && n) {
			this.configure({ expression: n });
			return;
		}
		if (e === "follow-pointer") {
			this.followPointer(n !== null && n !== "false");
			return;
		}
		e === "context" && n && this.applyContext(n);
	}
	configure(e = {}) {
		return e.design && (this.design = g({
			...this.design,
			...e.design
		})), e.motion && (this.motion = _({
			...this.motion,
			...e.motion
		})), e.color !== void 0 && (this.color = qt(e.color, this.color)), e.paper !== void 0 && (this.paper = qt(e.paper, this.paper)), e.expression !== void 0 && (this.baseExpression = $(e.expression), this.transitionTo(this.baseExpression)), e.followPointer !== void 0 && (this.configuredFollowPointer = !!e.followPointer, this.pointerFollowing = this.configuredFollowPointer, this.syncPointerListener()), this.updateGeometry(), this;
	}
	getConfig() {
		return {
			color: this.color,
			paper: this.paper,
			expression: this.baseExpression.id,
			design: g(this.design),
			motion: _(this.motion),
			followPointer: this.configuredFollowPointer,
			context: this.context
		};
	}
	get config() {
		return this.getConfig();
	}
	set config(e) {
		this.configure(e);
	}
	setExpression(e) {
		let t = Wt[e.toLowerCase()] ?? e.toLowerCase(), n = he.get(t);
		return n ? (this.transitionTo(n), !0) : !1;
	}
	lookAt(e, n) {
		return this.manualTarget = {
			x: t(Kt(e, 0), -1, 1),
			y: t(Kt(n, 0), -1, 1)
		}, this;
	}
	clearLook() {
		return this.manualTarget = null, this;
	}
	followPointer(e = !0) {
		return this.configuredFollowPointer = !!e, this.pointerFollowing = !!e, this.syncPointerListener(), this;
	}
	playBreak(e) {
		return Vt.includes(e) ? (this.activeBreak = {
			name: e,
			startedAt: performance.now()
		}, this.dispatchEvent(new CustomEvent("kumo-break-start", {
			detail: { name: e },
			bubbles: !0
		})), !0) : !1;
	}
	playAnimation(e, t = {}) {
		return this.sequenceToken++, this.startAnimation(e, t);
	}
	async playSequence(e) {
		let t = ++this.sequenceToken;
		for (let n of e) {
			if (t !== this.sequenceToken) return !1;
			let e = typeof n == "string" ? { name: n } : n;
			if (!await this.startAnimation(e.name, {
				duration: e.duration,
				returnToIdle: e.returnToIdle
			}) || t !== this.sequenceToken) return !1;
		}
		return !0;
	}
	stopAnimation() {
		return this.sequenceToken++, this.cancelAnimation("stopped"), this;
	}
	setContext(e) {
		return Bt.includes(e) ? (this.getAttribute("context") === e ? this.applyContext(e) : this.setAttribute("context", e), !0) : !1;
	}
	resumeIdle() {
		return this.getAttribute("context") === "idle" ? this.applyContext("idle") : this.setAttribute("context", "idle"), this;
	}
	startAnimation(e, t = {}) {
		let n = e.toLowerCase(), r = Ht[n] ?? n, i = r === "intro", a = r === "startup", o = i ? "idle" : a ? "swirl" : r, s = X.get(o);
		if (!s) return Promise.resolve(!1);
		this.cancelAnimation("replaced");
		let c = performance.now(), l = Kt(t.duration, i ? Ft : s.duration), u = i ? Ft : s.minDuration ?? .2, d = Math.max(u, l), f = t.returnToIdle !== !1 && o !== "idle", p = f ? X.get("idle").morph : 0, m = new Pt(100, "idle", this.bodyRadii, this.expressionAt(c));
		return o !== "idle" && m.setState(o, 0), new Promise((e) => {
			this.activeAnimation = {
				name: r,
				engine: m,
				startedAt: c,
				stateDuration: d,
				totalDuration: d + p,
				returnAt: f ? d : null,
				returned: !1,
				eyeTour: i || a || o === "swirl",
				resolve: e
			}, this.dispatchEvent(new CustomEvent("kumo-animation-start", {
				detail: {
					name: r,
					duration: d
				},
				bubbles: !0
			}));
		});
	}
	cancelAnimation(e) {
		let t = this.activeAnimation;
		t && (this.activeAnimation = null, t.resolve(!1), this.dispatchEvent(new CustomEvent("kumo-animation-cancel", {
			detail: {
				name: t.name,
				reason: e
			},
			bubbles: !0
		})));
	}
	finishAnimation(e) {
		this.activeAnimation === e && (this.activeAnimation = null, e.resolve(!0), this.dispatchEvent(new CustomEvent("kumo-animation-end", {
			detail: { name: e.name },
			bubbles: !0
		})));
	}
	transitionTo(e) {
		let t = performance.now();
		this.expressionFrom = this.expressionAt(t), this.expressionTo = e, this.expressionChangedAt = t;
	}
	expressionAt(e) {
		if (!this.expressionChangedAt) return this.expressionTo;
		let t = Jt((e - this.expressionChangedAt) / this.expressionDuration);
		return ve(this.expressionFrom, this.expressionTo, t);
	}
	applyContext(e) {
		Bt.includes(e) && (this.context = e, this.manualTarget = null, this.context === "loading" ? (this.pointerFollowing = !1, this.transitionTo($("attentive")), this.playBreak("scuttle")) : this.context === "success" ? (this.pointerFollowing = !1, this.transitionTo($("happy")), this.playBreak("stretch")) : this.context === "error" ? (this.pointerFollowing = !1, this.transitionTo($("sad")), this.playBreak("curl")) : this.context === "attention" ? (this.pointerFollowing = !1, this.transitionTo($("surprised")), this.playBreak("stretch")) : this.context === "hover" ? (this.pointerFollowing = !0, this.transitionTo($("curious"))) : (this.pointerFollowing = this.configuredFollowPointer, this.transitionTo(this.baseExpression)), this.syncPointerListener(), this.dispatchEvent(new CustomEvent("kumo-context-change", {
			detail: { context: this.context },
			bubbles: !0
		})));
	}
	updateGeometry() {
		let e = $e.get("kumo");
		this.bodyRadii = y(e.radii, this.design), this.attachments = j(e.attachments ?? [], this.design);
		let t = Be(U({
			radii: this.bodyRadii,
			rot: 0,
			cx: 0,
			cy: 0,
			sx: 1,
			sy: 1
		}, 100));
		this.idleBodyPath = t, this.bodyPaper.setAttribute("d", t), this.bodyPaper.setAttribute("fill", this.paper), this.body.setAttribute("d", t), this.body.setAttribute("fill", this.color), this.maskBody.setAttribute("d", t), this.eyeNodes.forEach((e) => e.setAttribute("fill", this.design.eyeColor)), this.legsGroup.replaceChildren(), this.legNodes.length = 0, this.attachments.forEach((e, t) => {
			let n = Q("g"), r = Q("path");
			n.setAttribute("data-kumo-leg", String(t)), r.setAttribute("d", e.d), r.setAttribute("transform", "scale(100)"), r.setAttribute("fill", this.color), r.setAttribute("stroke", "none"), n.append(r), this.legsGroup.append(n), this.legNodes.push({
				group: n,
				path: r
			});
		});
		let n = Math.max(...this.bodyRadii), r = this.attachments.reduce((e, t) => Math.max(e, Math.abs(t.minX), Math.abs(t.maxX), Math.abs(t.minY), Math.abs(t.maxY)), 0), i = Math.ceil(100 * (Math.max(n, r) + .18));
		this.viewBoxHalf = Math.max(158, i), this.mask.setAttribute("x", String(-this.viewBoxHalf)), this.mask.setAttribute("y", String(-this.viewBoxHalf)), this.mask.setAttribute("width", String(this.viewBoxHalf * 2)), this.mask.setAttribute("height", String(this.viewBoxHalf * 2)), this.svg.setAttribute("viewBox", `${-this.viewBoxHalf} ${-this.viewBoxHalf} ${this.viewBoxHalf * 2} ${this.viewBoxHalf * 2}`);
	}
	tick = (e) => {
		if (!this.connected) return;
		let t = (e - this.startedAt) / 1e3 * (this.reduceMotion ? .45 : 1), n = Math.min(.05, Math.max(0, (e - this.previousAt) / 1e3));
		this.previousAt = e, this.activeAnimation ? this.renderAuthoredAnimation(t, e) : this.renderIdle(t, e, n), this.raf = requestAnimationFrame(this.tick);
	};
	renderIdle(e, r, i) {
		this.clearAuthoredDecor(), this.maskBody.setAttribute("d", this.idleBodyPath), this.bodyPaper.setAttribute("d", this.idleBodyPath), this.bodyPaper.setAttribute("fill", this.paper), this.bodyPaper.setAttribute("opacity", "1"), this.body.setAttribute("d", this.idleBodyPath), this.body.setAttribute("fill", this.color), this.body.setAttribute("opacity", "1"), this.legsGroup.setAttribute("opacity", "1"), this.legsGroup.removeAttribute("transform"), this.maskNotch.setAttribute("r", "0");
		let a = fe(e, {
			wander: 1,
			blink: !0,
			float: !0
		}), s = this.expressionAt(r), c = this.context === "loading" ? {
			x: Math.sin(e * 2.1) * .72,
			y: Math.sin(e * 1.1 + .8) * .22
		} : this.context === "success" ? {
			x: 0,
			y: -.28
		} : this.context === "error" ? {
			x: -.24,
			y: .48
		} : this.context === "attention" ? {
			x: 0,
			y: -.62
		} : null, l = this.manualTarget ?? this.pointerTarget ?? c, u = 1 - Math.exp(-i * 9);
		this.currentLook.x = n(this.currentLook.x, l?.x ?? 0, u), this.currentLook.y = n(this.currentLook.y, l?.y ?? 0, u), this.currentLook.mix = n(this.currentLook.mix, l ? .9 : 0, u);
		let d = se({
			yaw: n(s.gaze.yaw, this.currentLook.x * 52, this.currentLook.mix) + a.dYaw,
			pitch: n(s.gaze.pitch, this.currentLook.y * -38, this.currentLook.mix) + a.dPitch,
			roll: s.gaze.roll + a.dRoll
		}, 100, s.split);
		for (let e = 0; e < this.eyeNodes.length; e++) {
			let n = this.eyeNodes[e], r = d[e], i = s.eyes[e];
			if (r.depth <= .02) {
				n.setAttribute("opacity", "0"), this.maskEyes[e].setAttribute("opacity", "0");
				continue;
			}
			let c = (i.tilt ?? 0) * Math.PI / 180, l = Math.cos(c), u = Math.sin(c), f = r.a * l + r.c * u, p = r.b * l + r.d * u, m = -r.a * u + r.c * l, h = -r.b * u + r.d * l, g = pe(Math.min(a.lid, i.open)), _ = K(this.bodyRadii, Math.atan2(r.y, r.x));
			n.setAttribute("d", Ke(i.w * 100, i.h * 100)), n.setAttribute("transform", `matrix(${o(f)},${o(p * g)},${o(m)},${o(h * g)},${o(r.x * _)},${o(r.y * _)})`), n.setAttribute("opacity", String(t(r.depth / .12)));
			let v = this.maskEyes[e];
			v.setAttribute("d", n.getAttribute("d") ?? ""), v.setAttribute("transform", n.getAttribute("transform") ?? ""), v.setAttribute("opacity", n.getAttribute("opacity") ?? "0");
		}
		this.scene.setAttribute("transform", `translate(${o(a.driftX * 100)} ${o(a.driftY * 100)}) scale(1 ${o(a.breath)})`);
		let f = null;
		if (this.activeBreak) {
			let e = Gt[this.activeBreak.name], n = (r - this.activeBreak.startedAt) / (e.duration * 1e3);
			if (n >= 1) {
				let e = this.activeBreak.name;
				this.activeBreak = null, this.dispatchEvent(new CustomEvent("kumo-break-end", {
					detail: { name: e },
					bubbles: !0
				}));
			} else f = {
				name: this.activeBreak.name,
				progress: t(n)
			};
		}
		this.attachments.forEach((t, n) => {
			let r = ne(e, n, this.motion), i = r.rotation, a = r.jointRotation;
			if (f) {
				let e = Gt[f.name], t = te(e.start + f.progress * e.duration, n, e.rhythm);
				i = r.rotation * (1 - t.mix) + t.rotation * this.motion.amount, a = r.jointRotation * (1 - t.mix) + t.jointRotation * this.motion.amount;
			}
			let s = t.pivotX * 100, c = t.pivotY * 100, l = this.legNodes[n];
			l.group.setAttribute("transform", `rotate(${o(i)} ${o(s)} ${o(c)})`), l.path.setAttribute("d", re(t, a));
		});
	}
	renderAuthoredAnimation(e, t) {
		let n = this.activeAnimation;
		if (!n) return;
		let r = Math.max(0, (t - n.startedAt) / 1e3);
		if (n.returnAt !== null && r >= n.returnAt && !n.returned && (n.engine.setState("idle", n.returnAt), n.returned = !0), r >= n.totalDuration) {
			this.finishAnimation(n), this.renderIdle(e, t, 0);
			return;
		}
		n.eyeTour && n.engine.setLook(It(r), r, 1 / 60), this.applyAuthoredFrame(n.engine.sample(r), e, n.engine.state);
	}
	applyAuthoredFrame(e, t, n) {
		this.scene.removeAttribute("transform"), this.maskBody.setAttribute("d", e.bodyPath), this.bodyPaper.setAttribute("d", e.bodyPath), this.bodyPaper.setAttribute("fill", this.paper), this.bodyPaper.setAttribute("opacity", String(e.bodyAlpha)), this.body.setAttribute("d", e.bodyPath), this.body.setAttribute("fill", this.color), this.body.setAttribute("opacity", String(e.bodyAlpha));
		let r = X.get(n)?.baseBody ?? !1, i = e.bodyTransform;
		this.legsGroup.setAttribute("opacity", r ? String(e.bodyAlpha) : "0"), this.legsGroup.setAttribute("transform", `translate(${o(i.x)} ${o(i.y)}) scale(${o(i.sx)} ${o(i.sy)}) rotate(${o(i.rotation)})`), r && this.attachments.forEach((e, n) => {
			let r = ne(t, n, this.motion), i = e.pivotX * 100, a = e.pivotY * 100, s = this.legNodes[n];
			s.group.setAttribute("transform", `rotate(${o(r.rotation)} ${o(i)} ${o(a)})`), s.path.setAttribute("d", re(e, r.jointRotation));
		});
		for (let t = 0; t < this.eyeNodes.length; t++) {
			let n = e.eyes[t], i = this.eyeNodes[t], a = this.maskEyes[t];
			if (!n) {
				i.setAttribute("opacity", "0"), a.setAttribute("opacity", "0");
				continue;
			}
			a.setAttribute("d", n.d), a.setAttribute("transform", n.matrix), a.setAttribute("opacity", String(n.alpha)), i.setAttribute("d", n.d), i.setAttribute("transform", n.matrix), i.setAttribute("fill", this.design.eyeColor), i.setAttribute("opacity", r ? String(n.alpha) : "0");
		}
		e.notch ? (this.maskNotch.setAttribute("cx", String(e.notch.x)), this.maskNotch.setAttribute("cy", String(e.notch.y)), this.maskNotch.setAttribute("r", String(e.notch.r))) : this.maskNotch.setAttribute("r", "0"), this.renderDots(e), this.renderArcs(e), e.notif ? (this.notification.setAttribute("cx", String(e.notif.x)), this.notification.setAttribute("cy", String(e.notif.y)), this.notification.setAttribute("r", String(e.notif.r))) : this.notification.setAttribute("r", "0");
	}
	renderDots(e) {
		this.dotsBehind.replaceChildren(), this.dotsFront.replaceChildren();
		let t = e.dotsBehind ? this.dotsBehind : this.dotsFront;
		for (let n of e.dots) {
			let e = n.d ? Q("path") : Q("circle"), r = n.color ?? (n.depth === void 0 ? this.color : et(this.paper, this.color, n.depth));
			e.setAttribute("fill", r), e.setAttribute("opacity", String(n.opacity)), e instanceof SVGPathElement && n.d ? (e.setAttribute("d", n.d), e.setAttribute("transform", `translate(${o(n.x)} ${o(n.y)}) rotate(${o(n.rot ?? 0)}) scale(100)`)) : (e.setAttribute("cx", String(n.x)), e.setAttribute("cy", String(n.y)), e.setAttribute("r", String(n.r))), t.append(e);
		}
	}
	renderArcs(e) {
		for (let e of this.defs.querySelectorAll("[data-kumo-gradient]")) e.remove();
		this.backArcs.replaceChildren(), this.frontArcs.replaceChildren();
		for (let t of e.arcs) {
			let e = Q("linearGradient"), n = `${this.uid}-${t.id}`;
			e.setAttribute("id", n), e.setAttribute("data-kumo-gradient", ""), e.setAttribute("gradientUnits", "userSpaceOnUse"), e.setAttribute("x1", String(t.grad.x1)), e.setAttribute("y1", String(t.grad.y1)), e.setAttribute("x2", String(t.grad.x2)), e.setAttribute("y2", String(t.grad.y2)), t.grad.stops.forEach((n, r) => {
				let i = Q("stop");
				i.setAttribute("offset", String(r / Math.max(1, t.grad.stops.length - 1))), i.setAttribute("stop-color", n), e.append(i);
			}), this.defs.append(e);
			let r = (e) => {
				let r = Q("path");
				return r.setAttribute("d", e), r.setAttribute("stroke", `url(#${n})`), r.setAttribute("stroke-width", String(t.width)), r.setAttribute("opacity", String(t.opacity)), r;
			};
			this.backArcs.append(r(t.back)), this.frontArcs.append(r(t.front));
		}
	}
	clearAuthoredDecor() {
		this.dotsBehind.replaceChildren(), this.dotsFront.replaceChildren(), this.backArcs.replaceChildren(), this.frontArcs.replaceChildren(), this.notification.setAttribute("r", "0");
		for (let e of this.defs.querySelectorAll("[data-kumo-gradient]")) e.remove();
	}
	onPointerMove = (e) => {
		if (!this.pointerFollowing || e.pointerType === "touch") return;
		let n = this.getBoundingClientRect();
		!n.width || !n.height || (this.pointerTarget = {
			x: t((e.clientX - (n.left + n.width / 2)) / (n.width * .58), -1, 1),
			y: t((e.clientY - (n.top + n.height / 2)) / (n.height * .58), -1, 1)
		});
	};
	onPointerLeave = () => {
		this.pointerTarget = null;
	};
	onReducedMotion = (e) => {
		this.reduceMotion = e.matches;
	};
	syncPointerListener() {
		this.detachPointerListener(), !(!this.connected || !this.pointerFollowing) && (window.addEventListener("pointermove", this.onPointerMove), document.addEventListener("pointerleave", this.onPointerLeave));
	}
	detachPointerListener() {
		window.removeEventListener("pointermove", this.onPointerMove), document.removeEventListener("pointerleave", this.onPointerLeave), this.pointerTarget = null;
	}
};
customElements.get("kumo-logo") || customElements.define("kumo-logo", Yt);
//#endregion
export { Yt as KumoLogoElement };
