var app = (function () {
    'use strict';

    function noop() { }
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function create_slot(definition, ctx, $$scope, fn) {
        if (definition) {
            const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
            return definition[0](slot_ctx);
        }
    }
    function get_slot_context(definition, ctx, $$scope, fn) {
        return definition[1] && fn
            ? assign($$scope.ctx.slice(), definition[1](fn(ctx)))
            : $$scope.ctx;
    }
    function get_slot_changes(definition, $$scope, dirty, fn) {
        if (definition[2] && fn) {
            const lets = definition[2](fn(dirty));
            if (typeof $$scope.dirty === 'object') {
                const merged = [];
                const len = Math.max($$scope.dirty.length, lets.length);
                for (let i = 0; i < len; i += 1) {
                    merged[i] = $$scope.dirty[i] | lets[i];
                }
                return merged;
            }
            return $$scope.dirty | lets;
        }
        return $$scope.dirty;
    }
    function exclude_internal_props(props) {
        const result = {};
        for (const k in props)
            if (k[0] !== '$')
                result[k] = props[k];
        return result;
    }
    function action_destroyer(action_result) {
        return action_result && is_function(action_result.destroy) ? action_result.destroy : noop;
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function svg_element(name) {
        return document.createElementNS('http://www.w3.org/2000/svg', name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function prevent_default(fn) {
        return function (event) {
            event.preventDefault();
            // @ts-ignore
            return fn.call(this, event);
        };
    }
    function stop_propagation(fn) {
        return function (event) {
            event.stopPropagation();
            // @ts-ignore
            return fn.call(this, event);
        };
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function set_attributes(node, attributes) {
        // @ts-ignore
        const descriptors = Object.getOwnPropertyDescriptors(node.__proto__);
        for (const key in attributes) {
            if (attributes[key] == null) {
                node.removeAttribute(key);
            }
            else if (key === 'style') {
                node.style.cssText = attributes[key];
            }
            else if (key === '__value' || descriptors[key] && descriptors[key].set) {
                node[key] = attributes[key];
            }
            else {
                attr(node, key, attributes[key]);
            }
        }
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.data !== data)
            text.data = data;
    }
    function set_input_value(input, value) {
        if (value != null || input.value) {
            input.value = value;
        }
    }
    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error(`Function called outside component initialization`);
        return current_component;
    }
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }
    function onDestroy(fn) {
        get_current_component().$$.on_destroy.push(fn);
    }
    function setContext(key, context) {
        get_current_component().$$.context.set(key, context);
    }
    function getContext(key) {
        return get_current_component().$$.context.get(key);
    }
    // TODO figure out if we still want to support
    // shorthand events, or if we want to implement
    // a real bubbling mechanism
    function bubble(component, event) {
        const callbacks = component.$$.callbacks[event.type];
        if (callbacks) {
            callbacks.slice().forEach(fn => fn(event));
        }
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    function add_flush_callback(fn) {
        flush_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    function outro_and_destroy_block(block, lookup) {
        transition_out(block, 1, 1, () => {
            lookup.delete(block.key);
        });
    }
    function update_keyed_each(old_blocks, dirty, get_key, dynamic, ctx, list, lookup, node, destroy, create_each_block, next, get_context) {
        let o = old_blocks.length;
        let n = list.length;
        let i = o;
        const old_indexes = {};
        while (i--)
            old_indexes[old_blocks[i].key] = i;
        const new_blocks = [];
        const new_lookup = new Map();
        const deltas = new Map();
        i = n;
        while (i--) {
            const child_ctx = get_context(ctx, list, i);
            const key = get_key(child_ctx);
            let block = lookup.get(key);
            if (!block) {
                block = create_each_block(key, child_ctx);
                block.c();
            }
            else if (dynamic) {
                block.p(child_ctx, dirty);
            }
            new_lookup.set(key, new_blocks[i] = block);
            if (key in old_indexes)
                deltas.set(key, Math.abs(i - old_indexes[key]));
        }
        const will_move = new Set();
        const did_move = new Set();
        function insert(block) {
            transition_in(block, 1);
            block.m(node, next);
            lookup.set(block.key, block);
            next = block.first;
            n--;
        }
        while (o && n) {
            const new_block = new_blocks[n - 1];
            const old_block = old_blocks[o - 1];
            const new_key = new_block.key;
            const old_key = old_block.key;
            if (new_block === old_block) {
                // do nothing
                next = new_block.first;
                o--;
                n--;
            }
            else if (!new_lookup.has(old_key)) {
                // remove old block
                destroy(old_block, lookup);
                o--;
            }
            else if (!lookup.has(new_key) || will_move.has(new_key)) {
                insert(new_block);
            }
            else if (did_move.has(old_key)) {
                o--;
            }
            else if (deltas.get(new_key) > deltas.get(old_key)) {
                did_move.add(new_key);
                insert(new_block);
            }
            else {
                will_move.add(old_key);
                o--;
            }
        }
        while (o--) {
            const old_block = old_blocks[o];
            if (!new_lookup.has(old_block.key))
                destroy(old_block, lookup);
        }
        while (n)
            insert(new_blocks[n - 1]);
        return new_blocks;
    }

    function get_spread_update(levels, updates) {
        const update = {};
        const to_null_out = {};
        const accounted_for = { $$scope: 1 };
        let i = levels.length;
        while (i--) {
            const o = levels[i];
            const n = updates[i];
            if (n) {
                for (const key in o) {
                    if (!(key in n))
                        to_null_out[key] = 1;
                }
                for (const key in n) {
                    if (!accounted_for[key]) {
                        update[key] = n[key];
                        accounted_for[key] = 1;
                    }
                }
                levels[i] = n;
            }
            else {
                for (const key in o) {
                    accounted_for[key] = 1;
                }
            }
        }
        for (const key in to_null_out) {
            if (!(key in update))
                update[key] = undefined;
        }
        return update;
    }
    function get_spread_object(spread_props) {
        return typeof spread_props === 'object' && spread_props !== null ? spread_props : {};
    }

    function bind(component, name, callback) {
        const index = component.$$.props[name];
        if (index !== undefined) {
            component.$$.bound[index] = callback;
            callback(component.$$.ctx[index]);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if ($$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(children(options.target));
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }

    /*! *****************************************************************************
    Copyright (c) Microsoft Corporation. All rights reserved.
    Licensed under the Apache License, Version 2.0 (the "License"); you may not use
    this file except in compliance with the License. You may obtain a copy of the
    License at http://www.apache.org/licenses/LICENSE-2.0

    THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
    WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
    MERCHANTABLITY OR NON-INFRINGEMENT.

    See the Apache Version 2.0 License for specific language governing permissions
    and limitations under the License.
    ***************************************************************************** */
    /* global Reflect, Promise */

    var extendStatics = function(d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };

    function __extends(d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    }

    var __assign = function() {
        __assign = Object.assign || function __assign(t) {
            for (var s, i = 1, n = arguments.length; i < n; i++) {
                s = arguments[i];
                for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
            }
            return t;
        };
        return __assign.apply(this, arguments);
    };

    function __awaiter(thisArg, _arguments, P, generator) {
        function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
        return new (P || (P = Promise))(function (resolve, reject) {
            function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
            function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
            function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
            step((generator = generator.apply(thisArg, _arguments || [])).next());
        });
    }

    function __generator(thisArg, body) {
        var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
        return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
        function verb(n) { return function (v) { return step([n, v]); }; }
        function step(op) {
            if (f) throw new TypeError("Generator is already executing.");
            while (_) try {
                if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
                if (y = 0, t) op = [op[0] & 2, t.value];
                switch (op[0]) {
                    case 0: case 1: t = op; break;
                    case 4: _.label++; return { value: op[1], done: false };
                    case 5: _.label++; y = op[1]; op = [0]; continue;
                    case 7: op = _.ops.pop(); _.trys.pop(); continue;
                    default:
                        if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                        if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                        if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                        if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                        if (t[2]) _.ops.pop();
                        _.trys.pop(); continue;
                }
                op = body.call(thisArg, _);
            } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
            if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
        }
    }

    function __read(o, n) {
        var m = typeof Symbol === "function" && o[Symbol.iterator];
        if (!m) return o;
        var i = m.call(o), r, ar = [], e;
        try {
            while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
        }
        catch (error) { e = { error: error }; }
        finally {
            try {
                if (r && !r.done && (m = i["return"])) m.call(i);
            }
            finally { if (e) throw e.error; }
        }
        return ar;
    }

    function __spread() {
        for (var ar = [], i = 0; i < arguments.length; i++)
            ar = ar.concat(__read(arguments[i]));
        return ar;
    }

    /**
     * @license
     * Copyright 2016 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var MDCFoundation = /** @class */ (function () {
        function MDCFoundation(adapter) {
            if (adapter === void 0) { adapter = {}; }
            this.adapter_ = adapter;
        }
        Object.defineProperty(MDCFoundation, "cssClasses", {
            get: function () {
                // Classes extending MDCFoundation should implement this method to return an object which exports every
                // CSS class the foundation class needs as a property. e.g. {ACTIVE: 'mdc-component--active'}
                return {};
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCFoundation, "strings", {
            get: function () {
                // Classes extending MDCFoundation should implement this method to return an object which exports all
                // semantic strings as constants. e.g. {ARIA_ROLE: 'tablist'}
                return {};
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCFoundation, "numbers", {
            get: function () {
                // Classes extending MDCFoundation should implement this method to return an object which exports all
                // of its semantic numbers as constants. e.g. {ANIMATION_DELAY_MS: 350}
                return {};
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCFoundation, "defaultAdapter", {
            get: function () {
                // Classes extending MDCFoundation may choose to implement this getter in order to provide a convenient
                // way of viewing the necessary methods of an adapter. In the future, this could also be used for adapter
                // validation.
                return {};
            },
            enumerable: true,
            configurable: true
        });
        MDCFoundation.prototype.init = function () {
            // Subclasses should override this method to perform initialization routines (registering events, etc.)
        };
        MDCFoundation.prototype.destroy = function () {
            // Subclasses should override this method to perform de-initialization routines (de-registering events, etc.)
        };
        return MDCFoundation;
    }());

    /**
     * @license
     * Copyright 2016 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var MDCComponent = /** @class */ (function () {
        function MDCComponent(root, foundation) {
            var args = [];
            for (var _i = 2; _i < arguments.length; _i++) {
                args[_i - 2] = arguments[_i];
            }
            this.root_ = root;
            this.initialize.apply(this, __spread(args));
            // Note that we initialize foundation here and not within the constructor's default param so that
            // this.root_ is defined and can be used within the foundation class.
            this.foundation_ = foundation === undefined ? this.getDefaultFoundation() : foundation;
            this.foundation_.init();
            this.initialSyncWithDOM();
        }
        MDCComponent.attachTo = function (root) {
            // Subclasses which extend MDCBase should provide an attachTo() method that takes a root element and
            // returns an instantiated component with its root set to that element. Also note that in the cases of
            // subclasses, an explicit foundation class will not have to be passed in; it will simply be initialized
            // from getDefaultFoundation().
            return new MDCComponent(root, new MDCFoundation({}));
        };
        /* istanbul ignore next: method param only exists for typing purposes; it does not need to be unit tested */
        MDCComponent.prototype.initialize = function () {
            var _args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                _args[_i] = arguments[_i];
            }
            // Subclasses can override this to do any additional setup work that would be considered part of a
            // "constructor". Essentially, it is a hook into the parent constructor before the foundation is
            // initialized. Any additional arguments besides root and foundation will be passed in here.
        };
        MDCComponent.prototype.getDefaultFoundation = function () {
            // Subclasses must override this method to return a properly configured foundation class for the
            // component.
            throw new Error('Subclasses must override getDefaultFoundation to return a properly configured ' +
                'foundation class');
        };
        MDCComponent.prototype.initialSyncWithDOM = function () {
            // Subclasses should override this method if they need to perform work to synchronize with a host DOM
            // object. An example of this would be a form control wrapper that needs to synchronize its internal state
            // to some property or attribute of the host DOM. Please note: this is *not* the place to perform DOM
            // reads/writes that would cause layout / paint, as this is called synchronously from within the constructor.
        };
        MDCComponent.prototype.destroy = function () {
            // Subclasses may implement this method to release any resources / deregister any listeners they have
            // attached. An example of this might be deregistering a resize event from the window object.
            this.foundation_.destroy();
        };
        MDCComponent.prototype.listen = function (evtType, handler, options) {
            this.root_.addEventListener(evtType, handler, options);
        };
        MDCComponent.prototype.unlisten = function (evtType, handler, options) {
            this.root_.removeEventListener(evtType, handler, options);
        };
        /**
         * Fires a cross-browser-compatible custom event from the component root of the given type, with the given data.
         */
        MDCComponent.prototype.emit = function (evtType, evtData, shouldBubble) {
            if (shouldBubble === void 0) { shouldBubble = false; }
            var evt;
            if (typeof CustomEvent === 'function') {
                evt = new CustomEvent(evtType, {
                    bubbles: shouldBubble,
                    detail: evtData,
                });
            }
            else {
                evt = document.createEvent('CustomEvent');
                evt.initCustomEvent(evtType, shouldBubble, false, evtData);
            }
            this.root_.dispatchEvent(evt);
        };
        return MDCComponent;
    }());

    /**
     * @license
     * Copyright 2019 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    /**
     * Stores result from applyPassive to avoid redundant processing to detect
     * passive event listener support.
     */
    var supportsPassive_;
    /**
     * Determine whether the current browser supports passive event listeners, and
     * if so, use them.
     */
    function applyPassive(globalObj, forceRefresh) {
        if (globalObj === void 0) { globalObj = window; }
        if (forceRefresh === void 0) { forceRefresh = false; }
        if (supportsPassive_ === undefined || forceRefresh) {
            var isSupported_1 = false;
            try {
                globalObj.document.addEventListener('test', function () { return undefined; }, {
                    get passive() {
                        isSupported_1 = true;
                        return isSupported_1;
                    },
                });
            }
            catch (e) {
            } // tslint:disable-line:no-empty cannot throw error due to tests. tslint also disables console.log.
            supportsPassive_ = isSupported_1;
        }
        return supportsPassive_ ? { passive: true } : false;
    }

    /**
     * @license
     * Copyright 2017 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var cssClasses = {
        ACTIVE: 'mdc-slider--active',
        DISABLED: 'mdc-slider--disabled',
        DISCRETE: 'mdc-slider--discrete',
        FOCUS: 'mdc-slider--focus',
        HAS_TRACK_MARKER: 'mdc-slider--display-markers',
        IN_TRANSIT: 'mdc-slider--in-transit',
        IS_DISCRETE: 'mdc-slider--discrete',
    };
    var strings = {
        ARIA_DISABLED: 'aria-disabled',
        ARIA_VALUEMAX: 'aria-valuemax',
        ARIA_VALUEMIN: 'aria-valuemin',
        ARIA_VALUENOW: 'aria-valuenow',
        CHANGE_EVENT: 'MDCSlider:change',
        INPUT_EVENT: 'MDCSlider:input',
        LAST_TRACK_MARKER_SELECTOR: '.mdc-slider__track-marker:last-child',
        PIN_VALUE_MARKER_SELECTOR: '.mdc-slider__pin-value-marker',
        STEP_DATA_ATTR: 'data-step',
        THUMB_CONTAINER_SELECTOR: '.mdc-slider__thumb-container',
        TRACK_MARKER_CONTAINER_SELECTOR: '.mdc-slider__track-marker-container',
        TRACK_SELECTOR: '.mdc-slider__track',
    };
    var numbers = {
        PAGE_FACTOR: 4,
    };

    /**
     * @license
     * Copyright 2016 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var cssPropertyNameMap = {
        animation: {
            prefixed: '-webkit-animation',
            standard: 'animation',
        },
        transform: {
            prefixed: '-webkit-transform',
            standard: 'transform',
        },
        transition: {
            prefixed: '-webkit-transition',
            standard: 'transition',
        },
    };
    var jsEventTypeMap = {
        animationend: {
            cssProperty: 'animation',
            prefixed: 'webkitAnimationEnd',
            standard: 'animationend',
        },
        animationiteration: {
            cssProperty: 'animation',
            prefixed: 'webkitAnimationIteration',
            standard: 'animationiteration',
        },
        animationstart: {
            cssProperty: 'animation',
            prefixed: 'webkitAnimationStart',
            standard: 'animationstart',
        },
        transitionend: {
            cssProperty: 'transition',
            prefixed: 'webkitTransitionEnd',
            standard: 'transitionend',
        },
    };
    function isWindow(windowObj) {
        return Boolean(windowObj.document) && typeof windowObj.document.createElement === 'function';
    }
    function getCorrectPropertyName(windowObj, cssProperty) {
        if (isWindow(windowObj) && cssProperty in cssPropertyNameMap) {
            var el = windowObj.document.createElement('div');
            var _a = cssPropertyNameMap[cssProperty], standard = _a.standard, prefixed = _a.prefixed;
            var isStandard = standard in el.style;
            return isStandard ? standard : prefixed;
        }
        return cssProperty;
    }
    function getCorrectEventName(windowObj, eventType) {
        if (isWindow(windowObj) && eventType in jsEventTypeMap) {
            var el = windowObj.document.createElement('div');
            var _a = jsEventTypeMap[eventType], standard = _a.standard, prefixed = _a.prefixed, cssProperty = _a.cssProperty;
            var isStandard = cssProperty in el.style;
            return isStandard ? standard : prefixed;
        }
        return eventType;
    }

    /**
     * @license
     * Copyright 2017 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var DOWN_EVENTS = ['mousedown', 'pointerdown', 'touchstart'];
    var UP_EVENTS = ['mouseup', 'pointerup', 'touchend'];
    var MOVE_EVENT_MAP = {
        mousedown: 'mousemove',
        pointerdown: 'pointermove',
        touchstart: 'touchmove',
    };
    var KEY_IDS = {
        ARROW_DOWN: 'ArrowDown',
        ARROW_LEFT: 'ArrowLeft',
        ARROW_RIGHT: 'ArrowRight',
        ARROW_UP: 'ArrowUp',
        END: 'End',
        HOME: 'Home',
        PAGE_DOWN: 'PageDown',
        PAGE_UP: 'PageUp',
    };
    var MDCSliderFoundation = /** @class */ (function (_super) {
        __extends(MDCSliderFoundation, _super);
        function MDCSliderFoundation(adapter) {
            var _this = _super.call(this, __assign({}, MDCSliderFoundation.defaultAdapter, adapter)) || this;
            /**
             * We set this to NaN since we want it to be a number, but we can't use '0' or '-1'
             * because those could be valid tabindices set by the client code.
             */
            _this.savedTabIndex_ = NaN;
            _this.active_ = false;
            _this.inTransit_ = false;
            _this.isDiscrete_ = false;
            _this.hasTrackMarker_ = false;
            _this.handlingThumbTargetEvt_ = false;
            _this.min_ = 0;
            _this.max_ = 100;
            _this.step_ = 0;
            _this.value_ = 0;
            _this.disabled_ = false;
            _this.preventFocusState_ = false;
            _this.thumbContainerPointerHandler_ = function () { return _this.handlingThumbTargetEvt_ = true; };
            _this.interactionStartHandler_ = function (evt) { return _this.handleDown_(evt); };
            _this.keydownHandler_ = function (evt) { return _this.handleKeydown_(evt); };
            _this.focusHandler_ = function () { return _this.handleFocus_(); };
            _this.blurHandler_ = function () { return _this.handleBlur_(); };
            _this.resizeHandler_ = function () { return _this.layout(); };
            return _this;
        }
        Object.defineProperty(MDCSliderFoundation, "cssClasses", {
            get: function () {
                return cssClasses;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCSliderFoundation, "strings", {
            get: function () {
                return strings;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCSliderFoundation, "numbers", {
            get: function () {
                return numbers;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCSliderFoundation, "defaultAdapter", {
            get: function () {
                // tslint:disable:object-literal-sort-keys Methods should be in the same order as the adapter interface.
                return {
                    hasClass: function () { return false; },
                    addClass: function () { return undefined; },
                    removeClass: function () { return undefined; },
                    getAttribute: function () { return null; },
                    setAttribute: function () { return undefined; },
                    removeAttribute: function () { return undefined; },
                    computeBoundingRect: function () { return ({ top: 0, right: 0, bottom: 0, left: 0, width: 0, height: 0 }); },
                    getTabIndex: function () { return 0; },
                    registerInteractionHandler: function () { return undefined; },
                    deregisterInteractionHandler: function () { return undefined; },
                    registerThumbContainerInteractionHandler: function () { return undefined; },
                    deregisterThumbContainerInteractionHandler: function () { return undefined; },
                    registerBodyInteractionHandler: function () { return undefined; },
                    deregisterBodyInteractionHandler: function () { return undefined; },
                    registerResizeHandler: function () { return undefined; },
                    deregisterResizeHandler: function () { return undefined; },
                    notifyInput: function () { return undefined; },
                    notifyChange: function () { return undefined; },
                    setThumbContainerStyleProperty: function () { return undefined; },
                    setTrackStyleProperty: function () { return undefined; },
                    setMarkerValue: function () { return undefined; },
                    appendTrackMarkers: function () { return undefined; },
                    removeTrackMarkers: function () { return undefined; },
                    setLastTrackMarkersStyleProperty: function () { return undefined; },
                    isRTL: function () { return false; },
                };
                // tslint:enable:object-literal-sort-keys
            },
            enumerable: true,
            configurable: true
        });
        MDCSliderFoundation.prototype.init = function () {
            var _this = this;
            this.isDiscrete_ = this.adapter_.hasClass(cssClasses.IS_DISCRETE);
            this.hasTrackMarker_ = this.adapter_.hasClass(cssClasses.HAS_TRACK_MARKER);
            DOWN_EVENTS.forEach(function (evtName) {
                _this.adapter_.registerInteractionHandler(evtName, _this.interactionStartHandler_);
                _this.adapter_.registerThumbContainerInteractionHandler(evtName, _this.thumbContainerPointerHandler_);
            });
            this.adapter_.registerInteractionHandler('keydown', this.keydownHandler_);
            this.adapter_.registerInteractionHandler('focus', this.focusHandler_);
            this.adapter_.registerInteractionHandler('blur', this.blurHandler_);
            this.adapter_.registerResizeHandler(this.resizeHandler_);
            this.layout();
            // At last step, provide a reasonable default value to discrete slider
            if (this.isDiscrete_ && this.getStep() === 0) {
                this.step_ = 1;
            }
        };
        MDCSliderFoundation.prototype.destroy = function () {
            var _this = this;
            DOWN_EVENTS.forEach(function (evtName) {
                _this.adapter_.deregisterInteractionHandler(evtName, _this.interactionStartHandler_);
                _this.adapter_.deregisterThumbContainerInteractionHandler(evtName, _this.thumbContainerPointerHandler_);
            });
            this.adapter_.deregisterInteractionHandler('keydown', this.keydownHandler_);
            this.adapter_.deregisterInteractionHandler('focus', this.focusHandler_);
            this.adapter_.deregisterInteractionHandler('blur', this.blurHandler_);
            this.adapter_.deregisterResizeHandler(this.resizeHandler_);
        };
        MDCSliderFoundation.prototype.setupTrackMarker = function () {
            if (this.isDiscrete_ && this.hasTrackMarker_ && this.getStep() !== 0) {
                var min = this.getMin();
                var max = this.getMax();
                var step = this.getStep();
                var numMarkers = (max - min) / step;
                // In case distance between max & min is indivisible to step,
                // we place the secondary to last marker proportionally at where thumb
                // could reach and place the last marker at max value
                var indivisible = Math.ceil(numMarkers) !== numMarkers;
                if (indivisible) {
                    numMarkers = Math.ceil(numMarkers);
                }
                this.adapter_.removeTrackMarkers();
                this.adapter_.appendTrackMarkers(numMarkers);
                if (indivisible) {
                    var lastStepRatio = (max - numMarkers * step) / step + 1;
                    this.adapter_.setLastTrackMarkersStyleProperty('flex-grow', String(lastStepRatio));
                }
            }
        };
        MDCSliderFoundation.prototype.layout = function () {
            this.rect_ = this.adapter_.computeBoundingRect();
            this.updateUIForCurrentValue_();
        };
        MDCSliderFoundation.prototype.getValue = function () {
            return this.value_;
        };
        MDCSliderFoundation.prototype.setValue = function (value) {
            this.setValue_(value, false);
        };
        MDCSliderFoundation.prototype.getMax = function () {
            return this.max_;
        };
        MDCSliderFoundation.prototype.setMax = function (max) {
            if (max < this.min_) {
                throw new Error('Cannot set max to be less than the slider\'s minimum value');
            }
            this.max_ = max;
            this.setValue_(this.value_, false, true);
            this.adapter_.setAttribute(strings.ARIA_VALUEMAX, String(this.max_));
            this.setupTrackMarker();
        };
        MDCSliderFoundation.prototype.getMin = function () {
            return this.min_;
        };
        MDCSliderFoundation.prototype.setMin = function (min) {
            if (min > this.max_) {
                throw new Error('Cannot set min to be greater than the slider\'s maximum value');
            }
            this.min_ = min;
            this.setValue_(this.value_, false, true);
            this.adapter_.setAttribute(strings.ARIA_VALUEMIN, String(this.min_));
            this.setupTrackMarker();
        };
        MDCSliderFoundation.prototype.getStep = function () {
            return this.step_;
        };
        MDCSliderFoundation.prototype.setStep = function (step) {
            if (step < 0) {
                throw new Error('Step cannot be set to a negative number');
            }
            if (this.isDiscrete_ && (typeof (step) !== 'number' || step < 1)) {
                step = 1;
            }
            this.step_ = step;
            this.setValue_(this.value_, false, true);
            this.setupTrackMarker();
        };
        MDCSliderFoundation.prototype.isDisabled = function () {
            return this.disabled_;
        };
        MDCSliderFoundation.prototype.setDisabled = function (disabled) {
            this.disabled_ = disabled;
            this.toggleClass_(cssClasses.DISABLED, this.disabled_);
            if (this.disabled_) {
                this.savedTabIndex_ = this.adapter_.getTabIndex();
                this.adapter_.setAttribute(strings.ARIA_DISABLED, 'true');
                this.adapter_.removeAttribute('tabindex');
            }
            else {
                this.adapter_.removeAttribute(strings.ARIA_DISABLED);
                if (!isNaN(this.savedTabIndex_)) {
                    this.adapter_.setAttribute('tabindex', String(this.savedTabIndex_));
                }
            }
        };
        /**
         * Called when the user starts interacting with the slider
         */
        MDCSliderFoundation.prototype.handleDown_ = function (downEvent) {
            var _this = this;
            if (this.disabled_) {
                return;
            }
            this.preventFocusState_ = true;
            this.setInTransit_(!this.handlingThumbTargetEvt_);
            this.handlingThumbTargetEvt_ = false;
            this.setActive_(true);
            var moveHandler = function (moveEvent) {
                _this.handleMove_(moveEvent);
            };
            var moveEventType = MOVE_EVENT_MAP[downEvent.type];
            // Note: upHandler is [de]registered on ALL potential pointer-related release event types, since some browsers
            // do not always fire these consistently in pairs.
            // (See https://github.com/material-components/material-components-web/issues/1192)
            var upHandler = function () {
                _this.handleUp_();
                _this.adapter_.deregisterBodyInteractionHandler(moveEventType, moveHandler);
                UP_EVENTS.forEach(function (evtName) { return _this.adapter_.deregisterBodyInteractionHandler(evtName, upHandler); });
            };
            this.adapter_.registerBodyInteractionHandler(moveEventType, moveHandler);
            UP_EVENTS.forEach(function (evtName) { return _this.adapter_.registerBodyInteractionHandler(evtName, upHandler); });
            this.setValueFromEvt_(downEvent);
        };
        /**
         * Called when the user moves the slider
         */
        MDCSliderFoundation.prototype.handleMove_ = function (evt) {
            evt.preventDefault();
            this.setValueFromEvt_(evt);
        };
        /**
         * Called when the user's interaction with the slider ends
         */
        MDCSliderFoundation.prototype.handleUp_ = function () {
            this.setActive_(false);
            this.adapter_.notifyChange();
        };
        /**
         * Returns the pageX of the event
         */
        MDCSliderFoundation.prototype.getPageX_ = function (evt) {
            if (evt.targetTouches && evt.targetTouches.length > 0) {
                return evt.targetTouches[0].pageX;
            }
            return evt.pageX;
        };
        /**
         * Sets the slider value from an event
         */
        MDCSliderFoundation.prototype.setValueFromEvt_ = function (evt) {
            var pageX = this.getPageX_(evt);
            var value = this.computeValueFromPageX_(pageX);
            this.setValue_(value, true);
        };
        /**
         * Computes the new value from the pageX position
         */
        MDCSliderFoundation.prototype.computeValueFromPageX_ = function (pageX) {
            var _a = this, max = _a.max_, min = _a.min_;
            var xPos = pageX - this.rect_.left;
            var pctComplete = xPos / this.rect_.width;
            if (this.adapter_.isRTL()) {
                pctComplete = 1 - pctComplete;
            }
            // Fit the percentage complete between the range [min,max]
            // by remapping from [0, 1] to [min, min+(max-min)].
            return min + pctComplete * (max - min);
        };
        /**
         * Handles keydown events
         */
        MDCSliderFoundation.prototype.handleKeydown_ = function (evt) {
            var keyId = this.getKeyId_(evt);
            var value = this.getValueForKeyId_(keyId);
            if (isNaN(value)) {
                return;
            }
            // Prevent page from scrolling due to key presses that would normally scroll the page
            evt.preventDefault();
            this.adapter_.addClass(cssClasses.FOCUS);
            this.setValue_(value, true);
            this.adapter_.notifyChange();
        };
        /**
         * Returns the computed name of the event
         */
        MDCSliderFoundation.prototype.getKeyId_ = function (kbdEvt) {
            if (kbdEvt.key === KEY_IDS.ARROW_LEFT || kbdEvt.keyCode === 37) {
                return KEY_IDS.ARROW_LEFT;
            }
            if (kbdEvt.key === KEY_IDS.ARROW_RIGHT || kbdEvt.keyCode === 39) {
                return KEY_IDS.ARROW_RIGHT;
            }
            if (kbdEvt.key === KEY_IDS.ARROW_UP || kbdEvt.keyCode === 38) {
                return KEY_IDS.ARROW_UP;
            }
            if (kbdEvt.key === KEY_IDS.ARROW_DOWN || kbdEvt.keyCode === 40) {
                return KEY_IDS.ARROW_DOWN;
            }
            if (kbdEvt.key === KEY_IDS.HOME || kbdEvt.keyCode === 36) {
                return KEY_IDS.HOME;
            }
            if (kbdEvt.key === KEY_IDS.END || kbdEvt.keyCode === 35) {
                return KEY_IDS.END;
            }
            if (kbdEvt.key === KEY_IDS.PAGE_UP || kbdEvt.keyCode === 33) {
                return KEY_IDS.PAGE_UP;
            }
            if (kbdEvt.key === KEY_IDS.PAGE_DOWN || kbdEvt.keyCode === 34) {
                return KEY_IDS.PAGE_DOWN;
            }
            return '';
        };
        /**
         * Computes the value given a keyboard key ID
         */
        MDCSliderFoundation.prototype.getValueForKeyId_ = function (keyId) {
            var _a = this, max = _a.max_, min = _a.min_, step = _a.step_;
            var delta = step || (max - min) / 100;
            var valueNeedsToBeFlipped = this.adapter_.isRTL() && (keyId === KEY_IDS.ARROW_LEFT || keyId === KEY_IDS.ARROW_RIGHT);
            if (valueNeedsToBeFlipped) {
                delta = -delta;
            }
            switch (keyId) {
                case KEY_IDS.ARROW_LEFT:
                case KEY_IDS.ARROW_DOWN:
                    return this.value_ - delta;
                case KEY_IDS.ARROW_RIGHT:
                case KEY_IDS.ARROW_UP:
                    return this.value_ + delta;
                case KEY_IDS.HOME:
                    return this.min_;
                case KEY_IDS.END:
                    return this.max_;
                case KEY_IDS.PAGE_UP:
                    return this.value_ + delta * numbers.PAGE_FACTOR;
                case KEY_IDS.PAGE_DOWN:
                    return this.value_ - delta * numbers.PAGE_FACTOR;
                default:
                    return NaN;
            }
        };
        MDCSliderFoundation.prototype.handleFocus_ = function () {
            if (this.preventFocusState_) {
                return;
            }
            this.adapter_.addClass(cssClasses.FOCUS);
        };
        MDCSliderFoundation.prototype.handleBlur_ = function () {
            this.preventFocusState_ = false;
            this.adapter_.removeClass(cssClasses.FOCUS);
        };
        /**
         * Sets the value of the slider
         */
        MDCSliderFoundation.prototype.setValue_ = function (value, shouldFireInput, force) {
            if (force === void 0) { force = false; }
            if (value === this.value_ && !force) {
                return;
            }
            var _a = this, min = _a.min_, max = _a.max_;
            var valueSetToBoundary = value === min || value === max;
            if (this.step_ && !valueSetToBoundary) {
                value = this.quantize_(value);
            }
            if (value < min) {
                value = min;
            }
            else if (value > max) {
                value = max;
            }
            this.value_ = value;
            this.adapter_.setAttribute(strings.ARIA_VALUENOW, String(this.value_));
            this.updateUIForCurrentValue_();
            if (shouldFireInput) {
                this.adapter_.notifyInput();
                if (this.isDiscrete_) {
                    this.adapter_.setMarkerValue(value);
                }
            }
        };
        /**
         * Calculates the quantized value
         */
        MDCSliderFoundation.prototype.quantize_ = function (value) {
            var numSteps = Math.round(value / this.step_);
            return numSteps * this.step_;
        };
        MDCSliderFoundation.prototype.updateUIForCurrentValue_ = function () {
            var _this = this;
            var _a = this, max = _a.max_, min = _a.min_, value = _a.value_;
            var pctComplete = (value - min) / (max - min);
            var translatePx = pctComplete * this.rect_.width;
            if (this.adapter_.isRTL()) {
                translatePx = this.rect_.width - translatePx;
            }
            var transformProp = getCorrectPropertyName(window, 'transform');
            var transitionendEvtName = getCorrectEventName(window, 'transitionend');
            if (this.inTransit_) {
                var onTransitionEnd_1 = function () {
                    _this.setInTransit_(false);
                    _this.adapter_.deregisterThumbContainerInteractionHandler(transitionendEvtName, onTransitionEnd_1);
                };
                this.adapter_.registerThumbContainerInteractionHandler(transitionendEvtName, onTransitionEnd_1);
            }
            requestAnimationFrame(function () {
                // NOTE(traviskaufman): It would be nice to use calc() here,
                // but IE cannot handle calcs in transforms correctly.
                // See: https://goo.gl/NC2itk
                // Also note that the -50% offset is used to center the slider thumb.
                _this.adapter_.setThumbContainerStyleProperty(transformProp, "translateX(" + translatePx + "px) translateX(-50%)");
                _this.adapter_.setTrackStyleProperty(transformProp, "scaleX(" + pctComplete + ")");
            });
        };
        /**
         * Toggles the active state of the slider
         */
        MDCSliderFoundation.prototype.setActive_ = function (active) {
            this.active_ = active;
            this.toggleClass_(cssClasses.ACTIVE, this.active_);
        };
        /**
         * Toggles the inTransit state of the slider
         */
        MDCSliderFoundation.prototype.setInTransit_ = function (inTransit) {
            this.inTransit_ = inTransit;
            this.toggleClass_(cssClasses.IN_TRANSIT, this.inTransit_);
        };
        /**
         * Conditionally adds or removes a class based on shouldBePresent
         */
        MDCSliderFoundation.prototype.toggleClass_ = function (className, shouldBePresent) {
            if (shouldBePresent) {
                this.adapter_.addClass(className);
            }
            else {
                this.adapter_.removeClass(className);
            }
        };
        return MDCSliderFoundation;
    }(MDCFoundation));

    /**
     * @license
     * Copyright 2017 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var MDCSlider = /** @class */ (function (_super) {
        __extends(MDCSlider, _super);
        function MDCSlider() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        MDCSlider.attachTo = function (root) {
            return new MDCSlider(root);
        };
        Object.defineProperty(MDCSlider.prototype, "value", {
            get: function () {
                return this.foundation_.getValue();
            },
            set: function (value) {
                this.foundation_.setValue(value);
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCSlider.prototype, "min", {
            get: function () {
                return this.foundation_.getMin();
            },
            set: function (min) {
                this.foundation_.setMin(min);
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCSlider.prototype, "max", {
            get: function () {
                return this.foundation_.getMax();
            },
            set: function (max) {
                this.foundation_.setMax(max);
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCSlider.prototype, "step", {
            get: function () {
                return this.foundation_.getStep();
            },
            set: function (step) {
                this.foundation_.setStep(step);
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCSlider.prototype, "disabled", {
            get: function () {
                return this.foundation_.isDisabled();
            },
            set: function (disabled) {
                this.foundation_.setDisabled(disabled);
            },
            enumerable: true,
            configurable: true
        });
        MDCSlider.prototype.initialize = function () {
            this.thumbContainer_ = this.root_.querySelector(strings.THUMB_CONTAINER_SELECTOR);
            this.track_ = this.root_.querySelector(strings.TRACK_SELECTOR);
            this.pinValueMarker_ = this.root_.querySelector(strings.PIN_VALUE_MARKER_SELECTOR);
            this.trackMarkerContainer_ = this.root_.querySelector(strings.TRACK_MARKER_CONTAINER_SELECTOR);
        };
        MDCSlider.prototype.getDefaultFoundation = function () {
            var _this = this;
            // DO NOT INLINE this variable. For backward compatibility, foundations take a Partial<MDCFooAdapter>.
            // To ensure we don't accidentally omit any methods, we need a separate, strongly typed adapter variable.
            // tslint:disable:object-literal-sort-keys Methods should be in the same order as the adapter interface.
            var adapter = {
                hasClass: function (className) { return _this.root_.classList.contains(className); },
                addClass: function (className) { return _this.root_.classList.add(className); },
                removeClass: function (className) { return _this.root_.classList.remove(className); },
                getAttribute: function (name) { return _this.root_.getAttribute(name); },
                setAttribute: function (name, value) { return _this.root_.setAttribute(name, value); },
                removeAttribute: function (name) { return _this.root_.removeAttribute(name); },
                computeBoundingRect: function () { return _this.root_.getBoundingClientRect(); },
                getTabIndex: function () { return _this.root_.tabIndex; },
                registerInteractionHandler: function (evtType, handler) { return _this.listen(evtType, handler, applyPassive()); },
                deregisterInteractionHandler: function (evtType, handler) { return _this.unlisten(evtType, handler, applyPassive()); },
                registerThumbContainerInteractionHandler: function (evtType, handler) {
                    _this.thumbContainer_.addEventListener(evtType, handler, applyPassive());
                },
                deregisterThumbContainerInteractionHandler: function (evtType, handler) {
                    _this.thumbContainer_.removeEventListener(evtType, handler, applyPassive());
                },
                registerBodyInteractionHandler: function (evtType, handler) { return document.body.addEventListener(evtType, handler); },
                deregisterBodyInteractionHandler: function (evtType, handler) { return document.body.removeEventListener(evtType, handler); },
                registerResizeHandler: function (handler) { return window.addEventListener('resize', handler); },
                deregisterResizeHandler: function (handler) { return window.removeEventListener('resize', handler); },
                notifyInput: function () { return _this.emit(strings.INPUT_EVENT, _this); },
                notifyChange: function () { return _this.emit(strings.CHANGE_EVENT, _this); },
                setThumbContainerStyleProperty: function (propertyName, value) {
                    _this.thumbContainer_.style.setProperty(propertyName, value);
                },
                setTrackStyleProperty: function (propertyName, value) { return _this.track_.style.setProperty(propertyName, value); },
                setMarkerValue: function (value) { return _this.pinValueMarker_.innerText = value.toLocaleString(); },
                appendTrackMarkers: function (numMarkers) {
                    var frag = document.createDocumentFragment();
                    for (var i = 0; i < numMarkers; i++) {
                        var marker = document.createElement('div');
                        marker.classList.add('mdc-slider__track-marker');
                        frag.appendChild(marker);
                    }
                    _this.trackMarkerContainer_.appendChild(frag);
                },
                removeTrackMarkers: function () {
                    while (_this.trackMarkerContainer_.firstChild) {
                        _this.trackMarkerContainer_.removeChild(_this.trackMarkerContainer_.firstChild);
                    }
                },
                setLastTrackMarkersStyleProperty: function (propertyName, value) {
                    // We remove and append new nodes, thus, the last track marker must be dynamically found.
                    var lastTrackMarker = _this.root_.querySelector(strings.LAST_TRACK_MARKER_SELECTOR);
                    lastTrackMarker.style.setProperty(propertyName, value);
                },
                isRTL: function () { return getComputedStyle(_this.root_).direction === 'rtl'; },
            };
            // tslint:enable:object-literal-sort-keys
            return new MDCSliderFoundation(adapter);
        };
        MDCSlider.prototype.initialSyncWithDOM = function () {
            var origValueNow = this.parseFloat_(this.root_.getAttribute(strings.ARIA_VALUENOW), this.value);
            var min = this.parseFloat_(this.root_.getAttribute(strings.ARIA_VALUEMIN), this.min);
            var max = this.parseFloat_(this.root_.getAttribute(strings.ARIA_VALUEMAX), this.max);
            // min and max need to be set in the right order to avoid throwing an error
            // when the new min is greater than the default max.
            if (min >= this.max) {
                this.max = max;
                this.min = min;
            }
            else {
                this.min = min;
                this.max = max;
            }
            this.step = this.parseFloat_(this.root_.getAttribute(strings.STEP_DATA_ATTR), this.step);
            this.value = origValueNow;
            this.disabled = (this.root_.hasAttribute(strings.ARIA_DISABLED) &&
                this.root_.getAttribute(strings.ARIA_DISABLED) !== 'false');
            this.foundation_.setupTrackMarker();
        };
        MDCSlider.prototype.layout = function () {
            this.foundation_.layout();
        };
        MDCSlider.prototype.stepUp = function (amount) {
            if (amount === void 0) { amount = (this.step || 1); }
            this.value += amount;
        };
        MDCSlider.prototype.stepDown = function (amount) {
            if (amount === void 0) { amount = (this.step || 1); }
            this.value -= amount;
        };
        MDCSlider.prototype.parseFloat_ = function (str, defaultValue) {
            var num = parseFloat(str); // tslint:disable-line:ban
            var isNumeric = typeof num === 'number' && isFinite(num);
            return isNumeric ? num : defaultValue;
        };
        return MDCSlider;
    }(MDCComponent));

    function forwardEventsBuilder(component, additionalEvents = []) {
      const events = [
        'focus', 'blur',
        'fullscreenchange', 'fullscreenerror', 'scroll',
        'cut', 'copy', 'paste',
        'keydown', 'keypress', 'keyup',
        'auxclick', 'click', 'contextmenu', 'dblclick', 'mousedown', 'mouseenter', 'mouseleave', 'mousemove', 'mouseover', 'mouseout', 'mouseup', 'pointerlockchange', 'pointerlockerror', 'select', 'wheel',
        'drag', 'dragend', 'dragenter', 'dragstart', 'dragleave', 'dragover', 'drop',
        'touchcancel', 'touchend', 'touchmove', 'touchstart',
        'pointerover', 'pointerenter', 'pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerout', 'pointerleave', 'gotpointercapture', 'lostpointercapture',
        ...additionalEvents
      ];

      function forward(e) {
        bubble(component, e);
      }

      return node => {
        const destructors = [];

        for (let i = 0; i < events.length; i++) {
          destructors.push(listen(node, events[i], forward));
        }

        return {
          destroy: () => {
            for (let i = 0; i < destructors.length; i++) {
              destructors[i]();
            }
          }
        }
      };
    }

    function exclude(obj, keys) {
      let names = Object.getOwnPropertyNames(obj);
      const newObj = {};

      for (let i = 0; i < names.length; i++) {
        const name = names[i];
        const cashIndex = name.indexOf('$');
        if (cashIndex !== -1 && keys.indexOf(name.substring(0, cashIndex + 1)) !== -1) {
          continue;
        }
        if (keys.indexOf(name) !== -1) {
          continue;
        }
        newObj[name] = obj[name];
      }

      return newObj;
    }

    function useActions(node, actions) {
      let objects = [];

      if (actions) {
        for (let i = 0; i < actions.length; i++) {
          const isArray = Array.isArray(actions[i]);
          const action = isArray ? actions[i][0] : actions[i];
          if (isArray && actions[i].length > 1) {
            objects.push(action(node, actions[i][1]));
          } else {
            objects.push(action(node));
          }
        }
      }

      return {
        update(actions) {
          if ((actions && actions.length || 0) != objects.length) {
            throw new Error('You must not change the length of an actions array.');
          }

          if (actions) {
            for (let i = 0; i < actions.length; i++) {
              if (objects[i] && 'update' in objects[i]) {
                const isArray = Array.isArray(actions[i]);
                if (isArray && actions[i].length > 1) {
                  objects[i].update(actions[i][1]);
                } else {
                  objects[i].update();
                }
              }
            }
          }
        },

        destroy() {
          for (let i = 0; i < objects.length; i++) {
            if (objects[i] && 'destroy' in objects[i]) {
              objects[i].destroy();
            }
          }
        }
      }
    }

    /* node_modules/@smui/slider/Slider.svelte generated by Svelte v3.19.1 */

    function create_if_block_1(ctx) {
    	let div;

    	return {
    		c() {
    			div = element("div");
    			attr(div, "class", "mdc-slider__track-marker-container");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    		}
    	};
    }

    // (29:4) {#if discrete}
    function create_if_block(ctx) {
    	let div;

    	return {
    		c() {
    			div = element("div");
    			div.innerHTML = `<span class="mdc-slider__pin-value-marker"></span>`;
    			attr(div, "class", "mdc-slider__pin");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    		}
    	};
    }

    function create_fragment(ctx) {
    	let div4;
    	let div1;
    	let div0;
    	let t0;
    	let t1;
    	let div3;
    	let t2;
    	let svg;
    	let circle;
    	let t3;
    	let div2;
    	let useActions_action;
    	let forwardEvents_action;
    	let dispose;
    	let if_block0 = /*discrete*/ ctx[4] && /*displayMarkers*/ ctx[5] && create_if_block_1();
    	let if_block1 = /*discrete*/ ctx[4] && create_if_block();

    	let div4_levels = [
    		{
    			class: "\n    mdc-slider\n    " + /*className*/ ctx[2] + "\n    " + (/*discrete*/ ctx[4] ? "mdc-slider--discrete" : "") + "\n    " + (/*discrete*/ ctx[4] && /*displayMarkers*/ ctx[5]
    			? "mdc-slider--display-markers"
    			: "") + "\n  "
    		},
    		{ role: "slider" },
    		{
    			"aria-disabled": /*disabled*/ ctx[3] ? "true" : "false"
    		},
    		{ "aria-valuemin": /*min*/ ctx[6] },
    		{ "aria-valuemax": /*max*/ ctx[7] },
    		{ "aria-valuenow": /*value*/ ctx[0] },
    		/*step*/ ctx[8] === 0
    		? {}
    		: { "data-step": /*step*/ ctx[8] },
    		{ tabindex: /*tabindex*/ ctx[9] },
    		/*inputProps*/ ctx[12],
    		exclude(/*$$props*/ ctx[14], [
    			"use",
    			"class",
    			"disabled",
    			"discrete",
    			"displayMarkers",
    			"min",
    			"max",
    			"step",
    			"value",
    			"tabindex"
    		])
    	];

    	let div4_data = {};

    	for (let i = 0; i < div4_levels.length; i += 1) {
    		div4_data = assign(div4_data, div4_levels[i]);
    	}

    	return {
    		c() {
    			div4 = element("div");
    			div1 = element("div");
    			div0 = element("div");
    			t0 = space();
    			if (if_block0) if_block0.c();
    			t1 = space();
    			div3 = element("div");
    			if (if_block1) if_block1.c();
    			t2 = space();
    			svg = svg_element("svg");
    			circle = svg_element("circle");
    			t3 = space();
    			div2 = element("div");
    			attr(div0, "class", "mdc-slider__track");
    			attr(div1, "class", "mdc-slider__track-container");
    			attr(circle, "cx", "10.5");
    			attr(circle, "cy", "10.5");
    			attr(circle, "r", "7.875");
    			attr(svg, "class", "mdc-slider__thumb");
    			attr(svg, "width", "21");
    			attr(svg, "height", "21");
    			attr(div2, "class", "mdc-slider__focus-ring");
    			attr(div3, "class", "mdc-slider__thumb-container");
    			set_attributes(div4, div4_data);
    		},
    		m(target, anchor) {
    			insert(target, div4, anchor);
    			append(div4, div1);
    			append(div1, div0);
    			append(div1, t0);
    			if (if_block0) if_block0.m(div1, null);
    			append(div4, t1);
    			append(div4, div3);
    			if (if_block1) if_block1.m(div3, null);
    			append(div3, t2);
    			append(div3, svg);
    			append(svg, circle);
    			append(div3, t3);
    			append(div3, div2);
    			/*div4_binding*/ ctx[23](div4);

    			dispose = [
    				action_destroyer(useActions_action = useActions.call(null, div4, /*use*/ ctx[1])),
    				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[11].call(null, div4)),
    				listen(div4, "MDCSlider:input", /*handleChange*/ ctx[13])
    			];
    		},
    		p(ctx, [dirty]) {
    			if (/*discrete*/ ctx[4] && /*displayMarkers*/ ctx[5]) {
    				if (!if_block0) {
    					if_block0 = create_if_block_1();
    					if_block0.c();
    					if_block0.m(div1, null);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (/*discrete*/ ctx[4]) {
    				if (!if_block1) {
    					if_block1 = create_if_block();
    					if_block1.c();
    					if_block1.m(div3, t2);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			set_attributes(div4, get_spread_update(div4_levels, [
    				dirty & /*className, discrete, displayMarkers*/ 52 && {
    					class: "\n    mdc-slider\n    " + /*className*/ ctx[2] + "\n    " + (/*discrete*/ ctx[4] ? "mdc-slider--discrete" : "") + "\n    " + (/*discrete*/ ctx[4] && /*displayMarkers*/ ctx[5]
    					? "mdc-slider--display-markers"
    					: "") + "\n  "
    				},
    				{ role: "slider" },
    				dirty & /*disabled*/ 8 && {
    					"aria-disabled": /*disabled*/ ctx[3] ? "true" : "false"
    				},
    				dirty & /*min*/ 64 && { "aria-valuemin": /*min*/ ctx[6] },
    				dirty & /*max*/ 128 && { "aria-valuemax": /*max*/ ctx[7] },
    				dirty & /*value*/ 1 && { "aria-valuenow": /*value*/ ctx[0] },
    				dirty & /*step*/ 256 && (/*step*/ ctx[8] === 0
    				? {}
    				: { "data-step": /*step*/ ctx[8] }),
    				dirty & /*tabindex*/ 512 && { tabindex: /*tabindex*/ ctx[9] },
    				dirty & /*inputProps*/ 4096 && /*inputProps*/ ctx[12],
    				dirty & /*exclude, $$props*/ 16384 && exclude(/*$$props*/ ctx[14], [
    					"use",
    					"class",
    					"disabled",
    					"discrete",
    					"displayMarkers",
    					"min",
    					"max",
    					"step",
    					"value",
    					"tabindex"
    				])
    			]));

    			if (useActions_action && is_function(useActions_action.update) && dirty & /*use*/ 2) useActions_action.update.call(null, /*use*/ ctx[1]);
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div4);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			/*div4_binding*/ ctx[23](null);
    			run_all(dispose);
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	const forwardEvents = forwardEventsBuilder(current_component, ["MDCSlider:input", "MDCSlider:change"]);
    	let { use = [] } = $$props;
    	let { class: className = "" } = $$props;
    	let { disabled = false } = $$props;
    	let { discrete = false } = $$props;
    	let { displayMarkers = false } = $$props;
    	let { min = 0 } = $$props;
    	let { max = 100 } = $$props;
    	let { step = 0 } = $$props;
    	let { value = null } = $$props;
    	let { tabindex = "0" } = $$props;
    	let element;
    	let slider;
    	let formField = getContext("SMUI:form-field");
    	let inputProps = getContext("SMUI:generic:input:props") || {};
    	let addLayoutListener = getContext("SMUI:addLayoutListener");
    	let removeLayoutListener;

    	if (addLayoutListener) {
    		removeLayoutListener = addLayoutListener(layout);
    	}

    	onMount(() => {
    		$$invalidate(19, slider = new MDCSlider(element));

    		if (formField && formField()) {
    			formField().input = slider;
    		}
    	});

    	onDestroy(() => {
    		slider && slider.destroy();

    		if (removeLayoutListener) {
    			removeLayoutListener();
    		}
    	});

    	function handleChange() {
    		$$invalidate(0, value = slider.value);
    	}

    	function layout(...args) {
    		return slider.layout(...args);
    	}

    	function stepUp(amount = 1, ...args) {
    		return slider.stepUp(amount, ...args);
    	}

    	function stepDown(amount = 1, ...args) {
    		return slider.stepDown(amount, ...args);
    	}

    	function getId() {
    		return inputProps && inputProps.id;
    	}

    	function div4_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(10, element = $$value);
    		});
    	}

    	$$self.$set = $$new_props => {
    		$$invalidate(14, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		if ("use" in $$new_props) $$invalidate(1, use = $$new_props.use);
    		if ("class" in $$new_props) $$invalidate(2, className = $$new_props.class);
    		if ("disabled" in $$new_props) $$invalidate(3, disabled = $$new_props.disabled);
    		if ("discrete" in $$new_props) $$invalidate(4, discrete = $$new_props.discrete);
    		if ("displayMarkers" in $$new_props) $$invalidate(5, displayMarkers = $$new_props.displayMarkers);
    		if ("min" in $$new_props) $$invalidate(6, min = $$new_props.min);
    		if ("max" in $$new_props) $$invalidate(7, max = $$new_props.max);
    		if ("step" in $$new_props) $$invalidate(8, step = $$new_props.step);
    		if ("value" in $$new_props) $$invalidate(0, value = $$new_props.value);
    		if ("tabindex" in $$new_props) $$invalidate(9, tabindex = $$new_props.tabindex);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*slider, disabled*/ 524296) {
    			 if (slider && slider.disabled !== disabled) {
    				$$invalidate(19, slider.disabled = disabled, slider);
    			}
    		}

    		if ($$self.$$.dirty & /*slider, min*/ 524352) {
    			 if (slider && slider.min !== min) {
    				$$invalidate(19, slider.min = min, slider);
    			}
    		}

    		if ($$self.$$.dirty & /*slider, max*/ 524416) {
    			 if (slider && slider.max !== max) {
    				$$invalidate(19, slider.max = max, slider);
    			}
    		}

    		if ($$self.$$.dirty & /*slider, step*/ 524544) {
    			 if (slider && slider.step !== step) {
    				$$invalidate(19, slider.step = step, slider);
    			}
    		}

    		if ($$self.$$.dirty & /*slider, value*/ 524289) {
    			 if (slider && slider.value !== value) {
    				$$invalidate(19, slider.value = value, slider);
    			}
    		}
    	};

    	$$props = exclude_internal_props($$props);

    	return [
    		value,
    		use,
    		className,
    		disabled,
    		discrete,
    		displayMarkers,
    		min,
    		max,
    		step,
    		tabindex,
    		element,
    		forwardEvents,
    		inputProps,
    		handleChange,
    		$$props,
    		layout,
    		stepUp,
    		stepDown,
    		getId,
    		slider,
    		removeLayoutListener,
    		formField,
    		addLayoutListener,
    		div4_binding
    	];
    }

    class Slider extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance, create_fragment, safe_not_equal, {
    			use: 1,
    			class: 2,
    			disabled: 3,
    			discrete: 4,
    			displayMarkers: 5,
    			min: 6,
    			max: 7,
    			step: 8,
    			value: 0,
    			tabindex: 9,
    			layout: 15,
    			stepUp: 16,
    			stepDown: 17,
    			getId: 18
    		});
    	}

    	get layout() {
    		return this.$$.ctx[15];
    	}

    	get stepUp() {
    		return this.$$.ctx[16];
    	}

    	get stepDown() {
    		return this.$$.ctx[17];
    	}

    	get getId() {
    		return this.$$.ctx[18];
    	}
    }

    /* src/Slider.svelte generated by Svelte v3.19.1 */

    function create_fragment$1(ctx) {
    	let div1;
    	let div0;
    	let updating_value;
    	let current;

    	function slider_value_binding(value) {
    		/*slider_value_binding*/ ctx[4].call(null, value);
    	}

    	let slider_props = {
    		style: "--mdc-theme-secondary: " + /*bgColor*/ ctx[1],
    		min: /*min*/ ctx[2],
    		max: /*max*/ ctx[3],
    		discrete: "true"
    	};

    	if (/*color*/ ctx[0] !== void 0) {
    		slider_props.value = /*color*/ ctx[0];
    	}

    	const slider = new Slider({ props: slider_props });
    	binding_callbacks.push(() => bind(slider, "value", slider_value_binding));

    	return {
    		c() {
    			div1 = element("div");
    			div0 = element("div");
    			create_component(slider.$$.fragment);
    			attr(div0, "bp", "10 offset-2");
    			attr(div1, "bp", "grid");
    		},
    		m(target, anchor) {
    			insert(target, div1, anchor);
    			append(div1, div0);
    			mount_component(slider, div0, null);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const slider_changes = {};
    			if (dirty & /*bgColor*/ 2) slider_changes.style = "--mdc-theme-secondary: " + /*bgColor*/ ctx[1];
    			if (dirty & /*min*/ 4) slider_changes.min = /*min*/ ctx[2];
    			if (dirty & /*max*/ 8) slider_changes.max = /*max*/ ctx[3];

    			if (!updating_value && dirty & /*color*/ 1) {
    				updating_value = true;
    				slider_changes.value = /*color*/ ctx[0];
    				add_flush_callback(() => updating_value = false);
    			}

    			slider.$set(slider_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(slider.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(slider.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div1);
    			destroy_component(slider);
    		}
    	};
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { color = 0 } = $$props;
    	let { bgColor = "coral" } = $$props;
    	let { min = 0 } = $$props;
    	let { max = 255 } = $$props;

    	function slider_value_binding(value) {
    		color = value;
    		$$invalidate(0, color);
    	}

    	$$self.$set = $$props => {
    		if ("color" in $$props) $$invalidate(0, color = $$props.color);
    		if ("bgColor" in $$props) $$invalidate(1, bgColor = $$props.bgColor);
    		if ("min" in $$props) $$invalidate(2, min = $$props.min);
    		if ("max" in $$props) $$invalidate(3, max = $$props.max);
    	};

    	return [color, bgColor, min, max, slider_value_binding];
    }

    class Slider_1 extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, { color: 0, bgColor: 1, min: 2, max: 3 });
    	}
    }

    /**
     * @license
     * Copyright 2018 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    /**
     * @fileoverview A "ponyfill" is a polyfill that doesn't modify the global prototype chain.
     * This makes ponyfills safer than traditional polyfills, especially for libraries like MDC.
     */
    function closest(element, selector) {
        if (element.closest) {
            return element.closest(selector);
        }
        var el = element;
        while (el) {
            if (matches(el, selector)) {
                return el;
            }
            el = el.parentElement;
        }
        return null;
    }
    function matches(element, selector) {
        var nativeMatches = element.matches
            || element.webkitMatchesSelector
            || element.msMatchesSelector;
        return nativeMatches.call(element, selector);
    }

    /**
     * @license
     * Copyright 2016 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var cssClasses$1 = {
        LABEL_FLOAT_ABOVE: 'mdc-floating-label--float-above',
        LABEL_SHAKE: 'mdc-floating-label--shake',
        ROOT: 'mdc-floating-label',
    };

    /**
     * @license
     * Copyright 2016 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var MDCFloatingLabelFoundation = /** @class */ (function (_super) {
        __extends(MDCFloatingLabelFoundation, _super);
        function MDCFloatingLabelFoundation(adapter) {
            var _this = _super.call(this, __assign({}, MDCFloatingLabelFoundation.defaultAdapter, adapter)) || this;
            _this.shakeAnimationEndHandler_ = function () { return _this.handleShakeAnimationEnd_(); };
            return _this;
        }
        Object.defineProperty(MDCFloatingLabelFoundation, "cssClasses", {
            get: function () {
                return cssClasses$1;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCFloatingLabelFoundation, "defaultAdapter", {
            /**
             * See {@link MDCFloatingLabelAdapter} for typing information on parameters and return types.
             */
            get: function () {
                // tslint:disable:object-literal-sort-keys Methods should be in the same order as the adapter interface.
                return {
                    addClass: function () { return undefined; },
                    removeClass: function () { return undefined; },
                    getWidth: function () { return 0; },
                    registerInteractionHandler: function () { return undefined; },
                    deregisterInteractionHandler: function () { return undefined; },
                };
                // tslint:enable:object-literal-sort-keys
            },
            enumerable: true,
            configurable: true
        });
        MDCFloatingLabelFoundation.prototype.init = function () {
            this.adapter_.registerInteractionHandler('animationend', this.shakeAnimationEndHandler_);
        };
        MDCFloatingLabelFoundation.prototype.destroy = function () {
            this.adapter_.deregisterInteractionHandler('animationend', this.shakeAnimationEndHandler_);
        };
        /**
         * Returns the width of the label element.
         */
        MDCFloatingLabelFoundation.prototype.getWidth = function () {
            return this.adapter_.getWidth();
        };
        /**
         * Styles the label to produce a shake animation to indicate an error.
         * @param shouldShake If true, adds the shake CSS class; otherwise, removes shake class.
         */
        MDCFloatingLabelFoundation.prototype.shake = function (shouldShake) {
            var LABEL_SHAKE = MDCFloatingLabelFoundation.cssClasses.LABEL_SHAKE;
            if (shouldShake) {
                this.adapter_.addClass(LABEL_SHAKE);
            }
            else {
                this.adapter_.removeClass(LABEL_SHAKE);
            }
        };
        /**
         * Styles the label to float or dock.
         * @param shouldFloat If true, adds the float CSS class; otherwise, removes float and shake classes to dock the label.
         */
        MDCFloatingLabelFoundation.prototype.float = function (shouldFloat) {
            var _a = MDCFloatingLabelFoundation.cssClasses, LABEL_FLOAT_ABOVE = _a.LABEL_FLOAT_ABOVE, LABEL_SHAKE = _a.LABEL_SHAKE;
            if (shouldFloat) {
                this.adapter_.addClass(LABEL_FLOAT_ABOVE);
            }
            else {
                this.adapter_.removeClass(LABEL_FLOAT_ABOVE);
                this.adapter_.removeClass(LABEL_SHAKE);
            }
        };
        MDCFloatingLabelFoundation.prototype.handleShakeAnimationEnd_ = function () {
            var LABEL_SHAKE = MDCFloatingLabelFoundation.cssClasses.LABEL_SHAKE;
            this.adapter_.removeClass(LABEL_SHAKE);
        };
        return MDCFloatingLabelFoundation;
    }(MDCFoundation));

    /**
     * @license
     * Copyright 2016 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var MDCFloatingLabel = /** @class */ (function (_super) {
        __extends(MDCFloatingLabel, _super);
        function MDCFloatingLabel() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        MDCFloatingLabel.attachTo = function (root) {
            return new MDCFloatingLabel(root);
        };
        /**
         * Styles the label to produce the label shake for errors.
         * @param shouldShake If true, shakes the label by adding a CSS class; otherwise, stops shaking by removing the class.
         */
        MDCFloatingLabel.prototype.shake = function (shouldShake) {
            this.foundation_.shake(shouldShake);
        };
        /**
         * Styles the label to float/dock.
         * @param shouldFloat If true, floats the label by adding a CSS class; otherwise, docks it by removing the class.
         */
        MDCFloatingLabel.prototype.float = function (shouldFloat) {
            this.foundation_.float(shouldFloat);
        };
        MDCFloatingLabel.prototype.getWidth = function () {
            return this.foundation_.getWidth();
        };
        MDCFloatingLabel.prototype.getDefaultFoundation = function () {
            var _this = this;
            // DO NOT INLINE this variable. For backward compatibility, foundations take a Partial<MDCFooAdapter>.
            // To ensure we don't accidentally omit any methods, we need a separate, strongly typed adapter variable.
            // tslint:disable:object-literal-sort-keys Methods should be in the same order as the adapter interface.
            var adapter = {
                addClass: function (className) { return _this.root_.classList.add(className); },
                removeClass: function (className) { return _this.root_.classList.remove(className); },
                getWidth: function () { return _this.root_.scrollWidth; },
                registerInteractionHandler: function (evtType, handler) { return _this.listen(evtType, handler); },
                deregisterInteractionHandler: function (evtType, handler) { return _this.unlisten(evtType, handler); },
            };
            // tslint:enable:object-literal-sort-keys
            return new MDCFloatingLabelFoundation(adapter);
        };
        return MDCFloatingLabel;
    }(MDCComponent));

    /**
     * @license
     * Copyright 2018 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var cssClasses$2 = {
        LINE_RIPPLE_ACTIVE: 'mdc-line-ripple--active',
        LINE_RIPPLE_DEACTIVATING: 'mdc-line-ripple--deactivating',
    };

    /**
     * @license
     * Copyright 2018 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var MDCLineRippleFoundation = /** @class */ (function (_super) {
        __extends(MDCLineRippleFoundation, _super);
        function MDCLineRippleFoundation(adapter) {
            var _this = _super.call(this, __assign({}, MDCLineRippleFoundation.defaultAdapter, adapter)) || this;
            _this.transitionEndHandler_ = function (evt) { return _this.handleTransitionEnd(evt); };
            return _this;
        }
        Object.defineProperty(MDCLineRippleFoundation, "cssClasses", {
            get: function () {
                return cssClasses$2;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCLineRippleFoundation, "defaultAdapter", {
            /**
             * See {@link MDCLineRippleAdapter} for typing information on parameters and return types.
             */
            get: function () {
                // tslint:disable:object-literal-sort-keys Methods should be in the same order as the adapter interface.
                return {
                    addClass: function () { return undefined; },
                    removeClass: function () { return undefined; },
                    hasClass: function () { return false; },
                    setStyle: function () { return undefined; },
                    registerEventHandler: function () { return undefined; },
                    deregisterEventHandler: function () { return undefined; },
                };
                // tslint:enable:object-literal-sort-keys
            },
            enumerable: true,
            configurable: true
        });
        MDCLineRippleFoundation.prototype.init = function () {
            this.adapter_.registerEventHandler('transitionend', this.transitionEndHandler_);
        };
        MDCLineRippleFoundation.prototype.destroy = function () {
            this.adapter_.deregisterEventHandler('transitionend', this.transitionEndHandler_);
        };
        MDCLineRippleFoundation.prototype.activate = function () {
            this.adapter_.removeClass(cssClasses$2.LINE_RIPPLE_DEACTIVATING);
            this.adapter_.addClass(cssClasses$2.LINE_RIPPLE_ACTIVE);
        };
        MDCLineRippleFoundation.prototype.setRippleCenter = function (xCoordinate) {
            this.adapter_.setStyle('transform-origin', xCoordinate + "px center");
        };
        MDCLineRippleFoundation.prototype.deactivate = function () {
            this.adapter_.addClass(cssClasses$2.LINE_RIPPLE_DEACTIVATING);
        };
        MDCLineRippleFoundation.prototype.handleTransitionEnd = function (evt) {
            // Wait for the line ripple to be either transparent or opaque
            // before emitting the animation end event
            var isDeactivating = this.adapter_.hasClass(cssClasses$2.LINE_RIPPLE_DEACTIVATING);
            if (evt.propertyName === 'opacity') {
                if (isDeactivating) {
                    this.adapter_.removeClass(cssClasses$2.LINE_RIPPLE_ACTIVE);
                    this.adapter_.removeClass(cssClasses$2.LINE_RIPPLE_DEACTIVATING);
                }
            }
        };
        return MDCLineRippleFoundation;
    }(MDCFoundation));

    /**
     * @license
     * Copyright 2018 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var MDCLineRipple = /** @class */ (function (_super) {
        __extends(MDCLineRipple, _super);
        function MDCLineRipple() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        MDCLineRipple.attachTo = function (root) {
            return new MDCLineRipple(root);
        };
        /**
         * Activates the line ripple
         */
        MDCLineRipple.prototype.activate = function () {
            this.foundation_.activate();
        };
        /**
         * Deactivates the line ripple
         */
        MDCLineRipple.prototype.deactivate = function () {
            this.foundation_.deactivate();
        };
        /**
         * Sets the transform origin given a user's click location.
         * The `rippleCenter` is the x-coordinate of the middle of the ripple.
         */
        MDCLineRipple.prototype.setRippleCenter = function (xCoordinate) {
            this.foundation_.setRippleCenter(xCoordinate);
        };
        MDCLineRipple.prototype.getDefaultFoundation = function () {
            var _this = this;
            // DO NOT INLINE this variable. For backward compatibility, foundations take a Partial<MDCFooAdapter>.
            // To ensure we don't accidentally omit any methods, we need a separate, strongly typed adapter variable.
            // tslint:disable:object-literal-sort-keys Methods should be in the same order as the adapter interface.
            var adapter = {
                addClass: function (className) { return _this.root_.classList.add(className); },
                removeClass: function (className) { return _this.root_.classList.remove(className); },
                hasClass: function (className) { return _this.root_.classList.contains(className); },
                setStyle: function (propertyName, value) { return _this.root_.style.setProperty(propertyName, value); },
                registerEventHandler: function (evtType, handler) { return _this.listen(evtType, handler); },
                deregisterEventHandler: function (evtType, handler) { return _this.unlisten(evtType, handler); },
            };
            // tslint:enable:object-literal-sort-keys
            return new MDCLineRippleFoundation(adapter);
        };
        return MDCLineRipple;
    }(MDCComponent));

    /**
     * @license
     * Copyright 2018 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var strings$1 = {
        NOTCH_ELEMENT_SELECTOR: '.mdc-notched-outline__notch',
    };
    var numbers$1 = {
        // This should stay in sync with $mdc-notched-outline-padding * 2.
        NOTCH_ELEMENT_PADDING: 8,
    };
    var cssClasses$3 = {
        NO_LABEL: 'mdc-notched-outline--no-label',
        OUTLINE_NOTCHED: 'mdc-notched-outline--notched',
        OUTLINE_UPGRADED: 'mdc-notched-outline--upgraded',
    };

    /**
     * @license
     * Copyright 2017 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var MDCNotchedOutlineFoundation = /** @class */ (function (_super) {
        __extends(MDCNotchedOutlineFoundation, _super);
        function MDCNotchedOutlineFoundation(adapter) {
            return _super.call(this, __assign({}, MDCNotchedOutlineFoundation.defaultAdapter, adapter)) || this;
        }
        Object.defineProperty(MDCNotchedOutlineFoundation, "strings", {
            get: function () {
                return strings$1;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCNotchedOutlineFoundation, "cssClasses", {
            get: function () {
                return cssClasses$3;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCNotchedOutlineFoundation, "numbers", {
            get: function () {
                return numbers$1;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCNotchedOutlineFoundation, "defaultAdapter", {
            /**
             * See {@link MDCNotchedOutlineAdapter} for typing information on parameters and return types.
             */
            get: function () {
                // tslint:disable:object-literal-sort-keys Methods should be in the same order as the adapter interface.
                return {
                    addClass: function () { return undefined; },
                    removeClass: function () { return undefined; },
                    setNotchWidthProperty: function () { return undefined; },
                    removeNotchWidthProperty: function () { return undefined; },
                };
                // tslint:enable:object-literal-sort-keys
            },
            enumerable: true,
            configurable: true
        });
        /**
         * Adds the outline notched selector and updates the notch width calculated based off of notchWidth.
         */
        MDCNotchedOutlineFoundation.prototype.notch = function (notchWidth) {
            var OUTLINE_NOTCHED = MDCNotchedOutlineFoundation.cssClasses.OUTLINE_NOTCHED;
            if (notchWidth > 0) {
                notchWidth += numbers$1.NOTCH_ELEMENT_PADDING; // Add padding from left/right.
            }
            this.adapter_.setNotchWidthProperty(notchWidth);
            this.adapter_.addClass(OUTLINE_NOTCHED);
        };
        /**
         * Removes notched outline selector to close the notch in the outline.
         */
        MDCNotchedOutlineFoundation.prototype.closeNotch = function () {
            var OUTLINE_NOTCHED = MDCNotchedOutlineFoundation.cssClasses.OUTLINE_NOTCHED;
            this.adapter_.removeClass(OUTLINE_NOTCHED);
            this.adapter_.removeNotchWidthProperty();
        };
        return MDCNotchedOutlineFoundation;
    }(MDCFoundation));

    /**
     * @license
     * Copyright 2017 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var MDCNotchedOutline = /** @class */ (function (_super) {
        __extends(MDCNotchedOutline, _super);
        function MDCNotchedOutline() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        MDCNotchedOutline.attachTo = function (root) {
            return new MDCNotchedOutline(root);
        };
        MDCNotchedOutline.prototype.initialSyncWithDOM = function () {
            this.notchElement_ = this.root_.querySelector(strings$1.NOTCH_ELEMENT_SELECTOR);
            var label = this.root_.querySelector('.' + MDCFloatingLabelFoundation.cssClasses.ROOT);
            if (label) {
                label.style.transitionDuration = '0s';
                this.root_.classList.add(cssClasses$3.OUTLINE_UPGRADED);
                requestAnimationFrame(function () {
                    label.style.transitionDuration = '';
                });
            }
            else {
                this.root_.classList.add(cssClasses$3.NO_LABEL);
            }
        };
        /**
         * Updates classes and styles to open the notch to the specified width.
         * @param notchWidth The notch width in the outline.
         */
        MDCNotchedOutline.prototype.notch = function (notchWidth) {
            this.foundation_.notch(notchWidth);
        };
        /**
         * Updates classes and styles to close the notch.
         */
        MDCNotchedOutline.prototype.closeNotch = function () {
            this.foundation_.closeNotch();
        };
        MDCNotchedOutline.prototype.getDefaultFoundation = function () {
            var _this = this;
            // DO NOT INLINE this variable. For backward compatibility, foundations take a Partial<MDCFooAdapter>.
            // To ensure we don't accidentally omit any methods, we need a separate, strongly typed adapter variable.
            // tslint:disable:object-literal-sort-keys Methods should be in the same order as the adapter interface.
            var adapter = {
                addClass: function (className) { return _this.root_.classList.add(className); },
                removeClass: function (className) { return _this.root_.classList.remove(className); },
                setNotchWidthProperty: function (width) { return _this.notchElement_.style.setProperty('width', width + 'px'); },
                removeNotchWidthProperty: function () { return _this.notchElement_.style.removeProperty('width'); },
            };
            // tslint:enable:object-literal-sort-keys
            return new MDCNotchedOutlineFoundation(adapter);
        };
        return MDCNotchedOutline;
    }(MDCComponent));

    /**
     * @license
     * Copyright 2016 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var cssClasses$4 = {
        // Ripple is a special case where the "root" component is really a "mixin" of sorts,
        // given that it's an 'upgrade' to an existing component. That being said it is the root
        // CSS class that all other CSS classes derive from.
        BG_FOCUSED: 'mdc-ripple-upgraded--background-focused',
        FG_ACTIVATION: 'mdc-ripple-upgraded--foreground-activation',
        FG_DEACTIVATION: 'mdc-ripple-upgraded--foreground-deactivation',
        ROOT: 'mdc-ripple-upgraded',
        UNBOUNDED: 'mdc-ripple-upgraded--unbounded',
    };
    var strings$2 = {
        VAR_FG_SCALE: '--mdc-ripple-fg-scale',
        VAR_FG_SIZE: '--mdc-ripple-fg-size',
        VAR_FG_TRANSLATE_END: '--mdc-ripple-fg-translate-end',
        VAR_FG_TRANSLATE_START: '--mdc-ripple-fg-translate-start',
        VAR_LEFT: '--mdc-ripple-left',
        VAR_TOP: '--mdc-ripple-top',
    };
    var numbers$2 = {
        DEACTIVATION_TIMEOUT_MS: 225,
        FG_DEACTIVATION_MS: 150,
        INITIAL_ORIGIN_SCALE: 0.6,
        PADDING: 10,
        TAP_DELAY_MS: 300,
    };

    /**
     * Stores result from supportsCssVariables to avoid redundant processing to
     * detect CSS custom variable support.
     */
    var supportsCssVariables_;
    function detectEdgePseudoVarBug(windowObj) {
        // Detect versions of Edge with buggy var() support
        // See: https://developer.microsoft.com/en-us/microsoft-edge/platform/issues/11495448/
        var document = windowObj.document;
        var node = document.createElement('div');
        node.className = 'mdc-ripple-surface--test-edge-var-bug';
        // Append to head instead of body because this script might be invoked in the
        // head, in which case the body doesn't exist yet. The probe works either way.
        document.head.appendChild(node);
        // The bug exists if ::before style ends up propagating to the parent element.
        // Additionally, getComputedStyle returns null in iframes with display: "none" in Firefox,
        // but Firefox is known to support CSS custom properties correctly.
        // See: https://bugzilla.mozilla.org/show_bug.cgi?id=548397
        var computedStyle = windowObj.getComputedStyle(node);
        var hasPseudoVarBug = computedStyle !== null && computedStyle.borderTopStyle === 'solid';
        if (node.parentNode) {
            node.parentNode.removeChild(node);
        }
        return hasPseudoVarBug;
    }
    function supportsCssVariables(windowObj, forceRefresh) {
        if (forceRefresh === void 0) { forceRefresh = false; }
        var CSS = windowObj.CSS;
        var supportsCssVars = supportsCssVariables_;
        if (typeof supportsCssVariables_ === 'boolean' && !forceRefresh) {
            return supportsCssVariables_;
        }
        var supportsFunctionPresent = CSS && typeof CSS.supports === 'function';
        if (!supportsFunctionPresent) {
            return false;
        }
        var explicitlySupportsCssVars = CSS.supports('--css-vars', 'yes');
        // See: https://bugs.webkit.org/show_bug.cgi?id=154669
        // See: README section on Safari
        var weAreFeatureDetectingSafari10plus = (CSS.supports('(--css-vars: yes)') &&
            CSS.supports('color', '#00000000'));
        if (explicitlySupportsCssVars || weAreFeatureDetectingSafari10plus) {
            supportsCssVars = !detectEdgePseudoVarBug(windowObj);
        }
        else {
            supportsCssVars = false;
        }
        if (!forceRefresh) {
            supportsCssVariables_ = supportsCssVars;
        }
        return supportsCssVars;
    }
    function getNormalizedEventCoords(evt, pageOffset, clientRect) {
        if (!evt) {
            return { x: 0, y: 0 };
        }
        var x = pageOffset.x, y = pageOffset.y;
        var documentX = x + clientRect.left;
        var documentY = y + clientRect.top;
        var normalizedX;
        var normalizedY;
        // Determine touch point relative to the ripple container.
        if (evt.type === 'touchstart') {
            var touchEvent = evt;
            normalizedX = touchEvent.changedTouches[0].pageX - documentX;
            normalizedY = touchEvent.changedTouches[0].pageY - documentY;
        }
        else {
            var mouseEvent = evt;
            normalizedX = mouseEvent.pageX - documentX;
            normalizedY = mouseEvent.pageY - documentY;
        }
        return { x: normalizedX, y: normalizedY };
    }

    /**
     * @license
     * Copyright 2016 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    // Activation events registered on the root element of each instance for activation
    var ACTIVATION_EVENT_TYPES = [
        'touchstart', 'pointerdown', 'mousedown', 'keydown',
    ];
    // Deactivation events registered on documentElement when a pointer-related down event occurs
    var POINTER_DEACTIVATION_EVENT_TYPES = [
        'touchend', 'pointerup', 'mouseup', 'contextmenu',
    ];
    // simultaneous nested activations
    var activatedTargets = [];
    var MDCRippleFoundation = /** @class */ (function (_super) {
        __extends(MDCRippleFoundation, _super);
        function MDCRippleFoundation(adapter) {
            var _this = _super.call(this, __assign({}, MDCRippleFoundation.defaultAdapter, adapter)) || this;
            _this.activationAnimationHasEnded_ = false;
            _this.activationTimer_ = 0;
            _this.fgDeactivationRemovalTimer_ = 0;
            _this.fgScale_ = '0';
            _this.frame_ = { width: 0, height: 0 };
            _this.initialSize_ = 0;
            _this.layoutFrame_ = 0;
            _this.maxRadius_ = 0;
            _this.unboundedCoords_ = { left: 0, top: 0 };
            _this.activationState_ = _this.defaultActivationState_();
            _this.activationTimerCallback_ = function () {
                _this.activationAnimationHasEnded_ = true;
                _this.runDeactivationUXLogicIfReady_();
            };
            _this.activateHandler_ = function (e) { return _this.activate_(e); };
            _this.deactivateHandler_ = function () { return _this.deactivate_(); };
            _this.focusHandler_ = function () { return _this.handleFocus(); };
            _this.blurHandler_ = function () { return _this.handleBlur(); };
            _this.resizeHandler_ = function () { return _this.layout(); };
            return _this;
        }
        Object.defineProperty(MDCRippleFoundation, "cssClasses", {
            get: function () {
                return cssClasses$4;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCRippleFoundation, "strings", {
            get: function () {
                return strings$2;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCRippleFoundation, "numbers", {
            get: function () {
                return numbers$2;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCRippleFoundation, "defaultAdapter", {
            get: function () {
                return {
                    addClass: function () { return undefined; },
                    browserSupportsCssVars: function () { return true; },
                    computeBoundingRect: function () { return ({ top: 0, right: 0, bottom: 0, left: 0, width: 0, height: 0 }); },
                    containsEventTarget: function () { return true; },
                    deregisterDocumentInteractionHandler: function () { return undefined; },
                    deregisterInteractionHandler: function () { return undefined; },
                    deregisterResizeHandler: function () { return undefined; },
                    getWindowPageOffset: function () { return ({ x: 0, y: 0 }); },
                    isSurfaceActive: function () { return true; },
                    isSurfaceDisabled: function () { return true; },
                    isUnbounded: function () { return true; },
                    registerDocumentInteractionHandler: function () { return undefined; },
                    registerInteractionHandler: function () { return undefined; },
                    registerResizeHandler: function () { return undefined; },
                    removeClass: function () { return undefined; },
                    updateCssVariable: function () { return undefined; },
                };
            },
            enumerable: true,
            configurable: true
        });
        MDCRippleFoundation.prototype.init = function () {
            var _this = this;
            var supportsPressRipple = this.supportsPressRipple_();
            this.registerRootHandlers_(supportsPressRipple);
            if (supportsPressRipple) {
                var _a = MDCRippleFoundation.cssClasses, ROOT_1 = _a.ROOT, UNBOUNDED_1 = _a.UNBOUNDED;
                requestAnimationFrame(function () {
                    _this.adapter_.addClass(ROOT_1);
                    if (_this.adapter_.isUnbounded()) {
                        _this.adapter_.addClass(UNBOUNDED_1);
                        // Unbounded ripples need layout logic applied immediately to set coordinates for both shade and ripple
                        _this.layoutInternal_();
                    }
                });
            }
        };
        MDCRippleFoundation.prototype.destroy = function () {
            var _this = this;
            if (this.supportsPressRipple_()) {
                if (this.activationTimer_) {
                    clearTimeout(this.activationTimer_);
                    this.activationTimer_ = 0;
                    this.adapter_.removeClass(MDCRippleFoundation.cssClasses.FG_ACTIVATION);
                }
                if (this.fgDeactivationRemovalTimer_) {
                    clearTimeout(this.fgDeactivationRemovalTimer_);
                    this.fgDeactivationRemovalTimer_ = 0;
                    this.adapter_.removeClass(MDCRippleFoundation.cssClasses.FG_DEACTIVATION);
                }
                var _a = MDCRippleFoundation.cssClasses, ROOT_2 = _a.ROOT, UNBOUNDED_2 = _a.UNBOUNDED;
                requestAnimationFrame(function () {
                    _this.adapter_.removeClass(ROOT_2);
                    _this.adapter_.removeClass(UNBOUNDED_2);
                    _this.removeCssVars_();
                });
            }
            this.deregisterRootHandlers_();
            this.deregisterDeactivationHandlers_();
        };
        /**
         * @param evt Optional event containing position information.
         */
        MDCRippleFoundation.prototype.activate = function (evt) {
            this.activate_(evt);
        };
        MDCRippleFoundation.prototype.deactivate = function () {
            this.deactivate_();
        };
        MDCRippleFoundation.prototype.layout = function () {
            var _this = this;
            if (this.layoutFrame_) {
                cancelAnimationFrame(this.layoutFrame_);
            }
            this.layoutFrame_ = requestAnimationFrame(function () {
                _this.layoutInternal_();
                _this.layoutFrame_ = 0;
            });
        };
        MDCRippleFoundation.prototype.setUnbounded = function (unbounded) {
            var UNBOUNDED = MDCRippleFoundation.cssClasses.UNBOUNDED;
            if (unbounded) {
                this.adapter_.addClass(UNBOUNDED);
            }
            else {
                this.adapter_.removeClass(UNBOUNDED);
            }
        };
        MDCRippleFoundation.prototype.handleFocus = function () {
            var _this = this;
            requestAnimationFrame(function () {
                return _this.adapter_.addClass(MDCRippleFoundation.cssClasses.BG_FOCUSED);
            });
        };
        MDCRippleFoundation.prototype.handleBlur = function () {
            var _this = this;
            requestAnimationFrame(function () {
                return _this.adapter_.removeClass(MDCRippleFoundation.cssClasses.BG_FOCUSED);
            });
        };
        /**
         * We compute this property so that we are not querying information about the client
         * until the point in time where the foundation requests it. This prevents scenarios where
         * client-side feature-detection may happen too early, such as when components are rendered on the server
         * and then initialized at mount time on the client.
         */
        MDCRippleFoundation.prototype.supportsPressRipple_ = function () {
            return this.adapter_.browserSupportsCssVars();
        };
        MDCRippleFoundation.prototype.defaultActivationState_ = function () {
            return {
                activationEvent: undefined,
                hasDeactivationUXRun: false,
                isActivated: false,
                isProgrammatic: false,
                wasActivatedByPointer: false,
                wasElementMadeActive: false,
            };
        };
        /**
         * supportsPressRipple Passed from init to save a redundant function call
         */
        MDCRippleFoundation.prototype.registerRootHandlers_ = function (supportsPressRipple) {
            var _this = this;
            if (supportsPressRipple) {
                ACTIVATION_EVENT_TYPES.forEach(function (evtType) {
                    _this.adapter_.registerInteractionHandler(evtType, _this.activateHandler_);
                });
                if (this.adapter_.isUnbounded()) {
                    this.adapter_.registerResizeHandler(this.resizeHandler_);
                }
            }
            this.adapter_.registerInteractionHandler('focus', this.focusHandler_);
            this.adapter_.registerInteractionHandler('blur', this.blurHandler_);
        };
        MDCRippleFoundation.prototype.registerDeactivationHandlers_ = function (evt) {
            var _this = this;
            if (evt.type === 'keydown') {
                this.adapter_.registerInteractionHandler('keyup', this.deactivateHandler_);
            }
            else {
                POINTER_DEACTIVATION_EVENT_TYPES.forEach(function (evtType) {
                    _this.adapter_.registerDocumentInteractionHandler(evtType, _this.deactivateHandler_);
                });
            }
        };
        MDCRippleFoundation.prototype.deregisterRootHandlers_ = function () {
            var _this = this;
            ACTIVATION_EVENT_TYPES.forEach(function (evtType) {
                _this.adapter_.deregisterInteractionHandler(evtType, _this.activateHandler_);
            });
            this.adapter_.deregisterInteractionHandler('focus', this.focusHandler_);
            this.adapter_.deregisterInteractionHandler('blur', this.blurHandler_);
            if (this.adapter_.isUnbounded()) {
                this.adapter_.deregisterResizeHandler(this.resizeHandler_);
            }
        };
        MDCRippleFoundation.prototype.deregisterDeactivationHandlers_ = function () {
            var _this = this;
            this.adapter_.deregisterInteractionHandler('keyup', this.deactivateHandler_);
            POINTER_DEACTIVATION_EVENT_TYPES.forEach(function (evtType) {
                _this.adapter_.deregisterDocumentInteractionHandler(evtType, _this.deactivateHandler_);
            });
        };
        MDCRippleFoundation.prototype.removeCssVars_ = function () {
            var _this = this;
            var rippleStrings = MDCRippleFoundation.strings;
            var keys = Object.keys(rippleStrings);
            keys.forEach(function (key) {
                if (key.indexOf('VAR_') === 0) {
                    _this.adapter_.updateCssVariable(rippleStrings[key], null);
                }
            });
        };
        MDCRippleFoundation.prototype.activate_ = function (evt) {
            var _this = this;
            if (this.adapter_.isSurfaceDisabled()) {
                return;
            }
            var activationState = this.activationState_;
            if (activationState.isActivated) {
                return;
            }
            // Avoid reacting to follow-on events fired by touch device after an already-processed user interaction
            var previousActivationEvent = this.previousActivationEvent_;
            var isSameInteraction = previousActivationEvent && evt !== undefined && previousActivationEvent.type !== evt.type;
            if (isSameInteraction) {
                return;
            }
            activationState.isActivated = true;
            activationState.isProgrammatic = evt === undefined;
            activationState.activationEvent = evt;
            activationState.wasActivatedByPointer = activationState.isProgrammatic ? false : evt !== undefined && (evt.type === 'mousedown' || evt.type === 'touchstart' || evt.type === 'pointerdown');
            var hasActivatedChild = evt !== undefined && activatedTargets.length > 0 && activatedTargets.some(function (target) { return _this.adapter_.containsEventTarget(target); });
            if (hasActivatedChild) {
                // Immediately reset activation state, while preserving logic that prevents touch follow-on events
                this.resetActivationState_();
                return;
            }
            if (evt !== undefined) {
                activatedTargets.push(evt.target);
                this.registerDeactivationHandlers_(evt);
            }
            activationState.wasElementMadeActive = this.checkElementMadeActive_(evt);
            if (activationState.wasElementMadeActive) {
                this.animateActivation_();
            }
            requestAnimationFrame(function () {
                // Reset array on next frame after the current event has had a chance to bubble to prevent ancestor ripples
                activatedTargets = [];
                if (!activationState.wasElementMadeActive
                    && evt !== undefined
                    && (evt.key === ' ' || evt.keyCode === 32)) {
                    // If space was pressed, try again within an rAF call to detect :active, because different UAs report
                    // active states inconsistently when they're called within event handling code:
                    // - https://bugs.chromium.org/p/chromium/issues/detail?id=635971
                    // - https://bugzilla.mozilla.org/show_bug.cgi?id=1293741
                    // We try first outside rAF to support Edge, which does not exhibit this problem, but will crash if a CSS
                    // variable is set within a rAF callback for a submit button interaction (#2241).
                    activationState.wasElementMadeActive = _this.checkElementMadeActive_(evt);
                    if (activationState.wasElementMadeActive) {
                        _this.animateActivation_();
                    }
                }
                if (!activationState.wasElementMadeActive) {
                    // Reset activation state immediately if element was not made active.
                    _this.activationState_ = _this.defaultActivationState_();
                }
            });
        };
        MDCRippleFoundation.prototype.checkElementMadeActive_ = function (evt) {
            return (evt !== undefined && evt.type === 'keydown') ? this.adapter_.isSurfaceActive() : true;
        };
        MDCRippleFoundation.prototype.animateActivation_ = function () {
            var _this = this;
            var _a = MDCRippleFoundation.strings, VAR_FG_TRANSLATE_START = _a.VAR_FG_TRANSLATE_START, VAR_FG_TRANSLATE_END = _a.VAR_FG_TRANSLATE_END;
            var _b = MDCRippleFoundation.cssClasses, FG_DEACTIVATION = _b.FG_DEACTIVATION, FG_ACTIVATION = _b.FG_ACTIVATION;
            var DEACTIVATION_TIMEOUT_MS = MDCRippleFoundation.numbers.DEACTIVATION_TIMEOUT_MS;
            this.layoutInternal_();
            var translateStart = '';
            var translateEnd = '';
            if (!this.adapter_.isUnbounded()) {
                var _c = this.getFgTranslationCoordinates_(), startPoint = _c.startPoint, endPoint = _c.endPoint;
                translateStart = startPoint.x + "px, " + startPoint.y + "px";
                translateEnd = endPoint.x + "px, " + endPoint.y + "px";
            }
            this.adapter_.updateCssVariable(VAR_FG_TRANSLATE_START, translateStart);
            this.adapter_.updateCssVariable(VAR_FG_TRANSLATE_END, translateEnd);
            // Cancel any ongoing activation/deactivation animations
            clearTimeout(this.activationTimer_);
            clearTimeout(this.fgDeactivationRemovalTimer_);
            this.rmBoundedActivationClasses_();
            this.adapter_.removeClass(FG_DEACTIVATION);
            // Force layout in order to re-trigger the animation.
            this.adapter_.computeBoundingRect();
            this.adapter_.addClass(FG_ACTIVATION);
            this.activationTimer_ = setTimeout(function () { return _this.activationTimerCallback_(); }, DEACTIVATION_TIMEOUT_MS);
        };
        MDCRippleFoundation.prototype.getFgTranslationCoordinates_ = function () {
            var _a = this.activationState_, activationEvent = _a.activationEvent, wasActivatedByPointer = _a.wasActivatedByPointer;
            var startPoint;
            if (wasActivatedByPointer) {
                startPoint = getNormalizedEventCoords(activationEvent, this.adapter_.getWindowPageOffset(), this.adapter_.computeBoundingRect());
            }
            else {
                startPoint = {
                    x: this.frame_.width / 2,
                    y: this.frame_.height / 2,
                };
            }
            // Center the element around the start point.
            startPoint = {
                x: startPoint.x - (this.initialSize_ / 2),
                y: startPoint.y - (this.initialSize_ / 2),
            };
            var endPoint = {
                x: (this.frame_.width / 2) - (this.initialSize_ / 2),
                y: (this.frame_.height / 2) - (this.initialSize_ / 2),
            };
            return { startPoint: startPoint, endPoint: endPoint };
        };
        MDCRippleFoundation.prototype.runDeactivationUXLogicIfReady_ = function () {
            var _this = this;
            // This method is called both when a pointing device is released, and when the activation animation ends.
            // The deactivation animation should only run after both of those occur.
            var FG_DEACTIVATION = MDCRippleFoundation.cssClasses.FG_DEACTIVATION;
            var _a = this.activationState_, hasDeactivationUXRun = _a.hasDeactivationUXRun, isActivated = _a.isActivated;
            var activationHasEnded = hasDeactivationUXRun || !isActivated;
            if (activationHasEnded && this.activationAnimationHasEnded_) {
                this.rmBoundedActivationClasses_();
                this.adapter_.addClass(FG_DEACTIVATION);
                this.fgDeactivationRemovalTimer_ = setTimeout(function () {
                    _this.adapter_.removeClass(FG_DEACTIVATION);
                }, numbers$2.FG_DEACTIVATION_MS);
            }
        };
        MDCRippleFoundation.prototype.rmBoundedActivationClasses_ = function () {
            var FG_ACTIVATION = MDCRippleFoundation.cssClasses.FG_ACTIVATION;
            this.adapter_.removeClass(FG_ACTIVATION);
            this.activationAnimationHasEnded_ = false;
            this.adapter_.computeBoundingRect();
        };
        MDCRippleFoundation.prototype.resetActivationState_ = function () {
            var _this = this;
            this.previousActivationEvent_ = this.activationState_.activationEvent;
            this.activationState_ = this.defaultActivationState_();
            // Touch devices may fire additional events for the same interaction within a short time.
            // Store the previous event until it's safe to assume that subsequent events are for new interactions.
            setTimeout(function () { return _this.previousActivationEvent_ = undefined; }, MDCRippleFoundation.numbers.TAP_DELAY_MS);
        };
        MDCRippleFoundation.prototype.deactivate_ = function () {
            var _this = this;
            var activationState = this.activationState_;
            // This can happen in scenarios such as when you have a keyup event that blurs the element.
            if (!activationState.isActivated) {
                return;
            }
            var state = __assign({}, activationState);
            if (activationState.isProgrammatic) {
                requestAnimationFrame(function () { return _this.animateDeactivation_(state); });
                this.resetActivationState_();
            }
            else {
                this.deregisterDeactivationHandlers_();
                requestAnimationFrame(function () {
                    _this.activationState_.hasDeactivationUXRun = true;
                    _this.animateDeactivation_(state);
                    _this.resetActivationState_();
                });
            }
        };
        MDCRippleFoundation.prototype.animateDeactivation_ = function (_a) {
            var wasActivatedByPointer = _a.wasActivatedByPointer, wasElementMadeActive = _a.wasElementMadeActive;
            if (wasActivatedByPointer || wasElementMadeActive) {
                this.runDeactivationUXLogicIfReady_();
            }
        };
        MDCRippleFoundation.prototype.layoutInternal_ = function () {
            var _this = this;
            this.frame_ = this.adapter_.computeBoundingRect();
            var maxDim = Math.max(this.frame_.height, this.frame_.width);
            // Surface diameter is treated differently for unbounded vs. bounded ripples.
            // Unbounded ripple diameter is calculated smaller since the surface is expected to already be padded appropriately
            // to extend the hitbox, and the ripple is expected to meet the edges of the padded hitbox (which is typically
            // square). Bounded ripples, on the other hand, are fully expected to expand beyond the surface's longest diameter
            // (calculated based on the diagonal plus a constant padding), and are clipped at the surface's border via
            // `overflow: hidden`.
            var getBoundedRadius = function () {
                var hypotenuse = Math.sqrt(Math.pow(_this.frame_.width, 2) + Math.pow(_this.frame_.height, 2));
                return hypotenuse + MDCRippleFoundation.numbers.PADDING;
            };
            this.maxRadius_ = this.adapter_.isUnbounded() ? maxDim : getBoundedRadius();
            // Ripple is sized as a fraction of the largest dimension of the surface, then scales up using a CSS scale transform
            this.initialSize_ = Math.floor(maxDim * MDCRippleFoundation.numbers.INITIAL_ORIGIN_SCALE);
            this.fgScale_ = "" + this.maxRadius_ / this.initialSize_;
            this.updateLayoutCssVars_();
        };
        MDCRippleFoundation.prototype.updateLayoutCssVars_ = function () {
            var _a = MDCRippleFoundation.strings, VAR_FG_SIZE = _a.VAR_FG_SIZE, VAR_LEFT = _a.VAR_LEFT, VAR_TOP = _a.VAR_TOP, VAR_FG_SCALE = _a.VAR_FG_SCALE;
            this.adapter_.updateCssVariable(VAR_FG_SIZE, this.initialSize_ + "px");
            this.adapter_.updateCssVariable(VAR_FG_SCALE, this.fgScale_);
            if (this.adapter_.isUnbounded()) {
                this.unboundedCoords_ = {
                    left: Math.round((this.frame_.width / 2) - (this.initialSize_ / 2)),
                    top: Math.round((this.frame_.height / 2) - (this.initialSize_ / 2)),
                };
                this.adapter_.updateCssVariable(VAR_LEFT, this.unboundedCoords_.left + "px");
                this.adapter_.updateCssVariable(VAR_TOP, this.unboundedCoords_.top + "px");
            }
        };
        return MDCRippleFoundation;
    }(MDCFoundation));

    /**
     * @license
     * Copyright 2016 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var MDCRipple = /** @class */ (function (_super) {
        __extends(MDCRipple, _super);
        function MDCRipple() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.disabled = false;
            return _this;
        }
        MDCRipple.attachTo = function (root, opts) {
            if (opts === void 0) { opts = { isUnbounded: undefined }; }
            var ripple = new MDCRipple(root);
            // Only override unbounded behavior if option is explicitly specified
            if (opts.isUnbounded !== undefined) {
                ripple.unbounded = opts.isUnbounded;
            }
            return ripple;
        };
        MDCRipple.createAdapter = function (instance) {
            return {
                addClass: function (className) { return instance.root_.classList.add(className); },
                browserSupportsCssVars: function () { return supportsCssVariables(window); },
                computeBoundingRect: function () { return instance.root_.getBoundingClientRect(); },
                containsEventTarget: function (target) { return instance.root_.contains(target); },
                deregisterDocumentInteractionHandler: function (evtType, handler) {
                    return document.documentElement.removeEventListener(evtType, handler, applyPassive());
                },
                deregisterInteractionHandler: function (evtType, handler) {
                    return instance.root_.removeEventListener(evtType, handler, applyPassive());
                },
                deregisterResizeHandler: function (handler) { return window.removeEventListener('resize', handler); },
                getWindowPageOffset: function () { return ({ x: window.pageXOffset, y: window.pageYOffset }); },
                isSurfaceActive: function () { return matches(instance.root_, ':active'); },
                isSurfaceDisabled: function () { return Boolean(instance.disabled); },
                isUnbounded: function () { return Boolean(instance.unbounded); },
                registerDocumentInteractionHandler: function (evtType, handler) {
                    return document.documentElement.addEventListener(evtType, handler, applyPassive());
                },
                registerInteractionHandler: function (evtType, handler) {
                    return instance.root_.addEventListener(evtType, handler, applyPassive());
                },
                registerResizeHandler: function (handler) { return window.addEventListener('resize', handler); },
                removeClass: function (className) { return instance.root_.classList.remove(className); },
                updateCssVariable: function (varName, value) { return instance.root_.style.setProperty(varName, value); },
            };
        };
        Object.defineProperty(MDCRipple.prototype, "unbounded", {
            get: function () {
                return Boolean(this.unbounded_);
            },
            set: function (unbounded) {
                this.unbounded_ = Boolean(unbounded);
                this.setUnbounded_();
            },
            enumerable: true,
            configurable: true
        });
        MDCRipple.prototype.activate = function () {
            this.foundation_.activate();
        };
        MDCRipple.prototype.deactivate = function () {
            this.foundation_.deactivate();
        };
        MDCRipple.prototype.layout = function () {
            this.foundation_.layout();
        };
        MDCRipple.prototype.getDefaultFoundation = function () {
            return new MDCRippleFoundation(MDCRipple.createAdapter(this));
        };
        MDCRipple.prototype.initialSyncWithDOM = function () {
            var root = this.root_;
            this.unbounded = 'mdcRippleIsUnbounded' in root.dataset;
        };
        /**
         * Closure Compiler throws an access control error when directly accessing a
         * protected or private property inside a getter/setter, like unbounded above.
         * By accessing the protected property inside a method, we solve that problem.
         * That's why this function exists.
         */
        MDCRipple.prototype.setUnbounded_ = function () {
            this.foundation_.setUnbounded(Boolean(this.unbounded_));
        };
        return MDCRipple;
    }(MDCComponent));

    /**
     * @license
     * Copyright 2019 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var cssClasses$5 = {
        ROOT: 'mdc-text-field-character-counter',
    };
    var strings$3 = {
        ROOT_SELECTOR: "." + cssClasses$5.ROOT,
    };

    /**
     * @license
     * Copyright 2019 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var MDCTextFieldCharacterCounterFoundation = /** @class */ (function (_super) {
        __extends(MDCTextFieldCharacterCounterFoundation, _super);
        function MDCTextFieldCharacterCounterFoundation(adapter) {
            return _super.call(this, __assign({}, MDCTextFieldCharacterCounterFoundation.defaultAdapter, adapter)) || this;
        }
        Object.defineProperty(MDCTextFieldCharacterCounterFoundation, "cssClasses", {
            get: function () {
                return cssClasses$5;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCTextFieldCharacterCounterFoundation, "strings", {
            get: function () {
                return strings$3;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCTextFieldCharacterCounterFoundation, "defaultAdapter", {
            /**
             * See {@link MDCTextFieldCharacterCounterAdapter} for typing information on parameters and return types.
             */
            get: function () {
                return {
                    setContent: function () { return undefined; },
                };
            },
            enumerable: true,
            configurable: true
        });
        MDCTextFieldCharacterCounterFoundation.prototype.setCounterValue = function (currentLength, maxLength) {
            currentLength = Math.min(currentLength, maxLength);
            this.adapter_.setContent(currentLength + " / " + maxLength);
        };
        return MDCTextFieldCharacterCounterFoundation;
    }(MDCFoundation));

    /**
     * @license
     * Copyright 2019 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var MDCTextFieldCharacterCounter = /** @class */ (function (_super) {
        __extends(MDCTextFieldCharacterCounter, _super);
        function MDCTextFieldCharacterCounter() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        MDCTextFieldCharacterCounter.attachTo = function (root) {
            return new MDCTextFieldCharacterCounter(root);
        };
        Object.defineProperty(MDCTextFieldCharacterCounter.prototype, "foundation", {
            get: function () {
                return this.foundation_;
            },
            enumerable: true,
            configurable: true
        });
        MDCTextFieldCharacterCounter.prototype.getDefaultFoundation = function () {
            var _this = this;
            // DO NOT INLINE this variable. For backward compatibility, foundations take a Partial<MDCFooAdapter>.
            // To ensure we don't accidentally omit any methods, we need a separate, strongly typed adapter variable.
            var adapter = {
                setContent: function (content) {
                    _this.root_.textContent = content;
                },
            };
            return new MDCTextFieldCharacterCounterFoundation(adapter);
        };
        return MDCTextFieldCharacterCounter;
    }(MDCComponent));

    /**
     * @license
     * Copyright 2016 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var strings$4 = {
        ARIA_CONTROLS: 'aria-controls',
        ICON_SELECTOR: '.mdc-text-field__icon',
        INPUT_SELECTOR: '.mdc-text-field__input',
        LABEL_SELECTOR: '.mdc-floating-label',
        LINE_RIPPLE_SELECTOR: '.mdc-line-ripple',
        OUTLINE_SELECTOR: '.mdc-notched-outline',
    };
    var cssClasses$6 = {
        DENSE: 'mdc-text-field--dense',
        DISABLED: 'mdc-text-field--disabled',
        FOCUSED: 'mdc-text-field--focused',
        FULLWIDTH: 'mdc-text-field--fullwidth',
        HELPER_LINE: 'mdc-text-field-helper-line',
        INVALID: 'mdc-text-field--invalid',
        NO_LABEL: 'mdc-text-field--no-label',
        OUTLINED: 'mdc-text-field--outlined',
        ROOT: 'mdc-text-field',
        TEXTAREA: 'mdc-text-field--textarea',
        WITH_LEADING_ICON: 'mdc-text-field--with-leading-icon',
        WITH_TRAILING_ICON: 'mdc-text-field--with-trailing-icon',
    };
    var numbers$3 = {
        DENSE_LABEL_SCALE: 0.923,
        LABEL_SCALE: 0.75,
    };
    /**
     * Whitelist based off of https://developer.mozilla.org/en-US/docs/Web/Guide/HTML/HTML5/Constraint_validation
     * under the "Validation-related attributes" section.
     */
    var VALIDATION_ATTR_WHITELIST = [
        'pattern', 'min', 'max', 'required', 'step', 'minlength', 'maxlength',
    ];
    /**
     * Label should always float for these types as they show some UI even if value is empty.
     */
    var ALWAYS_FLOAT_TYPES = [
        'color', 'date', 'datetime-local', 'month', 'range', 'time', 'week',
    ];

    /**
     * @license
     * Copyright 2016 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var POINTERDOWN_EVENTS = ['mousedown', 'touchstart'];
    var INTERACTION_EVENTS = ['click', 'keydown'];
    var MDCTextFieldFoundation = /** @class */ (function (_super) {
        __extends(MDCTextFieldFoundation, _super);
        /**
         * @param adapter
         * @param foundationMap Map from subcomponent names to their subfoundations.
         */
        function MDCTextFieldFoundation(adapter, foundationMap) {
            if (foundationMap === void 0) { foundationMap = {}; }
            var _this = _super.call(this, __assign({}, MDCTextFieldFoundation.defaultAdapter, adapter)) || this;
            _this.isFocused_ = false;
            _this.receivedUserInput_ = false;
            _this.isValid_ = true;
            _this.useNativeValidation_ = true;
            _this.helperText_ = foundationMap.helperText;
            _this.characterCounter_ = foundationMap.characterCounter;
            _this.leadingIcon_ = foundationMap.leadingIcon;
            _this.trailingIcon_ = foundationMap.trailingIcon;
            _this.inputFocusHandler_ = function () { return _this.activateFocus(); };
            _this.inputBlurHandler_ = function () { return _this.deactivateFocus(); };
            _this.inputInputHandler_ = function () { return _this.handleInput(); };
            _this.setPointerXOffset_ = function (evt) { return _this.setTransformOrigin(evt); };
            _this.textFieldInteractionHandler_ = function () { return _this.handleTextFieldInteraction(); };
            _this.validationAttributeChangeHandler_ = function (attributesList) { return _this.handleValidationAttributeChange(attributesList); };
            return _this;
        }
        Object.defineProperty(MDCTextFieldFoundation, "cssClasses", {
            get: function () {
                return cssClasses$6;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCTextFieldFoundation, "strings", {
            get: function () {
                return strings$4;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCTextFieldFoundation, "numbers", {
            get: function () {
                return numbers$3;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCTextFieldFoundation.prototype, "shouldAlwaysFloat_", {
            get: function () {
                var type = this.getNativeInput_().type;
                return ALWAYS_FLOAT_TYPES.indexOf(type) >= 0;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCTextFieldFoundation.prototype, "shouldFloat", {
            get: function () {
                return this.shouldAlwaysFloat_ || this.isFocused_ || Boolean(this.getValue()) || this.isBadInput_();
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCTextFieldFoundation.prototype, "shouldShake", {
            get: function () {
                return !this.isFocused_ && !this.isValid() && Boolean(this.getValue());
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCTextFieldFoundation, "defaultAdapter", {
            /**
             * See {@link MDCTextFieldAdapter} for typing information on parameters and return types.
             */
            get: function () {
                // tslint:disable:object-literal-sort-keys Methods should be in the same order as the adapter interface.
                return {
                    addClass: function () { return undefined; },
                    removeClass: function () { return undefined; },
                    hasClass: function () { return true; },
                    registerTextFieldInteractionHandler: function () { return undefined; },
                    deregisterTextFieldInteractionHandler: function () { return undefined; },
                    registerInputInteractionHandler: function () { return undefined; },
                    deregisterInputInteractionHandler: function () { return undefined; },
                    registerValidationAttributeChangeHandler: function () { return new MutationObserver(function () { return undefined; }); },
                    deregisterValidationAttributeChangeHandler: function () { return undefined; },
                    getNativeInput: function () { return null; },
                    isFocused: function () { return false; },
                    activateLineRipple: function () { return undefined; },
                    deactivateLineRipple: function () { return undefined; },
                    setLineRippleTransformOrigin: function () { return undefined; },
                    shakeLabel: function () { return undefined; },
                    floatLabel: function () { return undefined; },
                    hasLabel: function () { return false; },
                    getLabelWidth: function () { return 0; },
                    hasOutline: function () { return false; },
                    notchOutline: function () { return undefined; },
                    closeOutline: function () { return undefined; },
                };
                // tslint:enable:object-literal-sort-keys
            },
            enumerable: true,
            configurable: true
        });
        MDCTextFieldFoundation.prototype.init = function () {
            var _this = this;
            if (this.adapter_.isFocused()) {
                this.inputFocusHandler_();
            }
            else if (this.adapter_.hasLabel() && this.shouldFloat) {
                this.notchOutline(true);
                this.adapter_.floatLabel(true);
            }
            this.adapter_.registerInputInteractionHandler('focus', this.inputFocusHandler_);
            this.adapter_.registerInputInteractionHandler('blur', this.inputBlurHandler_);
            this.adapter_.registerInputInteractionHandler('input', this.inputInputHandler_);
            POINTERDOWN_EVENTS.forEach(function (evtType) {
                _this.adapter_.registerInputInteractionHandler(evtType, _this.setPointerXOffset_);
            });
            INTERACTION_EVENTS.forEach(function (evtType) {
                _this.adapter_.registerTextFieldInteractionHandler(evtType, _this.textFieldInteractionHandler_);
            });
            this.validationObserver_ =
                this.adapter_.registerValidationAttributeChangeHandler(this.validationAttributeChangeHandler_);
            this.setCharacterCounter_(this.getValue().length);
        };
        MDCTextFieldFoundation.prototype.destroy = function () {
            var _this = this;
            this.adapter_.deregisterInputInteractionHandler('focus', this.inputFocusHandler_);
            this.adapter_.deregisterInputInteractionHandler('blur', this.inputBlurHandler_);
            this.adapter_.deregisterInputInteractionHandler('input', this.inputInputHandler_);
            POINTERDOWN_EVENTS.forEach(function (evtType) {
                _this.adapter_.deregisterInputInteractionHandler(evtType, _this.setPointerXOffset_);
            });
            INTERACTION_EVENTS.forEach(function (evtType) {
                _this.adapter_.deregisterTextFieldInteractionHandler(evtType, _this.textFieldInteractionHandler_);
            });
            this.adapter_.deregisterValidationAttributeChangeHandler(this.validationObserver_);
        };
        /**
         * Handles user interactions with the Text Field.
         */
        MDCTextFieldFoundation.prototype.handleTextFieldInteraction = function () {
            var nativeInput = this.adapter_.getNativeInput();
            if (nativeInput && nativeInput.disabled) {
                return;
            }
            this.receivedUserInput_ = true;
        };
        /**
         * Handles validation attribute changes
         */
        MDCTextFieldFoundation.prototype.handleValidationAttributeChange = function (attributesList) {
            var _this = this;
            attributesList.some(function (attributeName) {
                if (VALIDATION_ATTR_WHITELIST.indexOf(attributeName) > -1) {
                    _this.styleValidity_(true);
                    return true;
                }
                return false;
            });
            if (attributesList.indexOf('maxlength') > -1) {
                this.setCharacterCounter_(this.getValue().length);
            }
        };
        /**
         * Opens/closes the notched outline.
         */
        MDCTextFieldFoundation.prototype.notchOutline = function (openNotch) {
            if (!this.adapter_.hasOutline()) {
                return;
            }
            if (openNotch) {
                var isDense = this.adapter_.hasClass(cssClasses$6.DENSE);
                var labelScale = isDense ? numbers$3.DENSE_LABEL_SCALE : numbers$3.LABEL_SCALE;
                var labelWidth = this.adapter_.getLabelWidth() * labelScale;
                this.adapter_.notchOutline(labelWidth);
            }
            else {
                this.adapter_.closeOutline();
            }
        };
        /**
         * Activates the text field focus state.
         */
        MDCTextFieldFoundation.prototype.activateFocus = function () {
            this.isFocused_ = true;
            this.styleFocused_(this.isFocused_);
            this.adapter_.activateLineRipple();
            if (this.adapter_.hasLabel()) {
                this.notchOutline(this.shouldFloat);
                this.adapter_.floatLabel(this.shouldFloat);
                this.adapter_.shakeLabel(this.shouldShake);
            }
            if (this.helperText_) {
                this.helperText_.showToScreenReader();
            }
        };
        /**
         * Sets the line ripple's transform origin, so that the line ripple activate
         * animation will animate out from the user's click location.
         */
        MDCTextFieldFoundation.prototype.setTransformOrigin = function (evt) {
            var touches = evt.touches;
            var targetEvent = touches ? touches[0] : evt;
            var targetClientRect = targetEvent.target.getBoundingClientRect();
            var normalizedX = targetEvent.clientX - targetClientRect.left;
            this.adapter_.setLineRippleTransformOrigin(normalizedX);
        };
        /**
         * Handles input change of text input and text area.
         */
        MDCTextFieldFoundation.prototype.handleInput = function () {
            this.autoCompleteFocus();
            this.setCharacterCounter_(this.getValue().length);
        };
        /**
         * Activates the Text Field's focus state in cases when the input value
         * changes without user input (e.g. programmatically).
         */
        MDCTextFieldFoundation.prototype.autoCompleteFocus = function () {
            if (!this.receivedUserInput_) {
                this.activateFocus();
            }
        };
        /**
         * Deactivates the Text Field's focus state.
         */
        MDCTextFieldFoundation.prototype.deactivateFocus = function () {
            this.isFocused_ = false;
            this.adapter_.deactivateLineRipple();
            var isValid = this.isValid();
            this.styleValidity_(isValid);
            this.styleFocused_(this.isFocused_);
            if (this.adapter_.hasLabel()) {
                this.notchOutline(this.shouldFloat);
                this.adapter_.floatLabel(this.shouldFloat);
                this.adapter_.shakeLabel(this.shouldShake);
            }
            if (!this.shouldFloat) {
                this.receivedUserInput_ = false;
            }
        };
        MDCTextFieldFoundation.prototype.getValue = function () {
            return this.getNativeInput_().value;
        };
        /**
         * @param value The value to set on the input Element.
         */
        MDCTextFieldFoundation.prototype.setValue = function (value) {
            // Prevent Safari from moving the caret to the end of the input when the value has not changed.
            if (this.getValue() !== value) {
                this.getNativeInput_().value = value;
            }
            this.setCharacterCounter_(value.length);
            var isValid = this.isValid();
            this.styleValidity_(isValid);
            if (this.adapter_.hasLabel()) {
                this.notchOutline(this.shouldFloat);
                this.adapter_.floatLabel(this.shouldFloat);
                this.adapter_.shakeLabel(this.shouldShake);
            }
        };
        /**
         * @return The custom validity state, if set; otherwise, the result of a native validity check.
         */
        MDCTextFieldFoundation.prototype.isValid = function () {
            return this.useNativeValidation_
                ? this.isNativeInputValid_() : this.isValid_;
        };
        /**
         * @param isValid Sets the custom validity state of the Text Field.
         */
        MDCTextFieldFoundation.prototype.setValid = function (isValid) {
            this.isValid_ = isValid;
            this.styleValidity_(isValid);
            var shouldShake = !isValid && !this.isFocused_;
            if (this.adapter_.hasLabel()) {
                this.adapter_.shakeLabel(shouldShake);
            }
        };
        /**
         * Enables or disables the use of native validation. Use this for custom validation.
         * @param useNativeValidation Set this to false to ignore native input validation.
         */
        MDCTextFieldFoundation.prototype.setUseNativeValidation = function (useNativeValidation) {
            this.useNativeValidation_ = useNativeValidation;
        };
        MDCTextFieldFoundation.prototype.isDisabled = function () {
            return this.getNativeInput_().disabled;
        };
        /**
         * @param disabled Sets the text-field disabled or enabled.
         */
        MDCTextFieldFoundation.prototype.setDisabled = function (disabled) {
            this.getNativeInput_().disabled = disabled;
            this.styleDisabled_(disabled);
        };
        /**
         * @param content Sets the content of the helper text.
         */
        MDCTextFieldFoundation.prototype.setHelperTextContent = function (content) {
            if (this.helperText_) {
                this.helperText_.setContent(content);
            }
        };
        /**
         * Sets the aria label of the leading icon.
         */
        MDCTextFieldFoundation.prototype.setLeadingIconAriaLabel = function (label) {
            if (this.leadingIcon_) {
                this.leadingIcon_.setAriaLabel(label);
            }
        };
        /**
         * Sets the text content of the leading icon.
         */
        MDCTextFieldFoundation.prototype.setLeadingIconContent = function (content) {
            if (this.leadingIcon_) {
                this.leadingIcon_.setContent(content);
            }
        };
        /**
         * Sets the aria label of the trailing icon.
         */
        MDCTextFieldFoundation.prototype.setTrailingIconAriaLabel = function (label) {
            if (this.trailingIcon_) {
                this.trailingIcon_.setAriaLabel(label);
            }
        };
        /**
         * Sets the text content of the trailing icon.
         */
        MDCTextFieldFoundation.prototype.setTrailingIconContent = function (content) {
            if (this.trailingIcon_) {
                this.trailingIcon_.setContent(content);
            }
        };
        /**
         * Sets character counter values that shows characters used and the total character limit.
         */
        MDCTextFieldFoundation.prototype.setCharacterCounter_ = function (currentLength) {
            if (!this.characterCounter_) {
                return;
            }
            var maxLength = this.getNativeInput_().maxLength;
            if (maxLength === -1) {
                throw new Error('MDCTextFieldFoundation: Expected maxlength html property on text input or textarea.');
            }
            this.characterCounter_.setCounterValue(currentLength, maxLength);
        };
        /**
         * @return True if the Text Field input fails in converting the user-supplied value.
         */
        MDCTextFieldFoundation.prototype.isBadInput_ = function () {
            // The badInput property is not supported in IE 11 💩.
            return this.getNativeInput_().validity.badInput || false;
        };
        /**
         * @return The result of native validity checking (ValidityState.valid).
         */
        MDCTextFieldFoundation.prototype.isNativeInputValid_ = function () {
            return this.getNativeInput_().validity.valid;
        };
        /**
         * Styles the component based on the validity state.
         */
        MDCTextFieldFoundation.prototype.styleValidity_ = function (isValid) {
            var INVALID = MDCTextFieldFoundation.cssClasses.INVALID;
            if (isValid) {
                this.adapter_.removeClass(INVALID);
            }
            else {
                this.adapter_.addClass(INVALID);
            }
            if (this.helperText_) {
                this.helperText_.setValidity(isValid);
            }
        };
        /**
         * Styles the component based on the focused state.
         */
        MDCTextFieldFoundation.prototype.styleFocused_ = function (isFocused) {
            var FOCUSED = MDCTextFieldFoundation.cssClasses.FOCUSED;
            if (isFocused) {
                this.adapter_.addClass(FOCUSED);
            }
            else {
                this.adapter_.removeClass(FOCUSED);
            }
        };
        /**
         * Styles the component based on the disabled state.
         */
        MDCTextFieldFoundation.prototype.styleDisabled_ = function (isDisabled) {
            var _a = MDCTextFieldFoundation.cssClasses, DISABLED = _a.DISABLED, INVALID = _a.INVALID;
            if (isDisabled) {
                this.adapter_.addClass(DISABLED);
                this.adapter_.removeClass(INVALID);
            }
            else {
                this.adapter_.removeClass(DISABLED);
            }
            if (this.leadingIcon_) {
                this.leadingIcon_.setDisabled(isDisabled);
            }
            if (this.trailingIcon_) {
                this.trailingIcon_.setDisabled(isDisabled);
            }
        };
        /**
         * @return The native text input element from the host environment, or an object with the same shape for unit tests.
         */
        MDCTextFieldFoundation.prototype.getNativeInput_ = function () {
            // this.adapter_ may be undefined in foundation unit tests. This happens when testdouble is creating a mock object
            // and invokes the shouldShake/shouldFloat getters (which in turn call getValue(), which calls this method) before
            // init() has been called from the MDCTextField constructor. To work around that issue, we return a dummy object.
            var nativeInput = this.adapter_ ? this.adapter_.getNativeInput() : null;
            return nativeInput || {
                disabled: false,
                maxLength: -1,
                type: 'input',
                validity: {
                    badInput: false,
                    valid: true,
                },
                value: '',
            };
        };
        return MDCTextFieldFoundation;
    }(MDCFoundation));

    /**
     * @license
     * Copyright 2016 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var cssClasses$7 = {
        HELPER_TEXT_PERSISTENT: 'mdc-text-field-helper-text--persistent',
        HELPER_TEXT_VALIDATION_MSG: 'mdc-text-field-helper-text--validation-msg',
        ROOT: 'mdc-text-field-helper-text',
    };
    var strings$5 = {
        ARIA_HIDDEN: 'aria-hidden',
        ROLE: 'role',
        ROOT_SELECTOR: "." + cssClasses$7.ROOT,
    };

    /**
     * @license
     * Copyright 2017 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var MDCTextFieldHelperTextFoundation = /** @class */ (function (_super) {
        __extends(MDCTextFieldHelperTextFoundation, _super);
        function MDCTextFieldHelperTextFoundation(adapter) {
            return _super.call(this, __assign({}, MDCTextFieldHelperTextFoundation.defaultAdapter, adapter)) || this;
        }
        Object.defineProperty(MDCTextFieldHelperTextFoundation, "cssClasses", {
            get: function () {
                return cssClasses$7;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCTextFieldHelperTextFoundation, "strings", {
            get: function () {
                return strings$5;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCTextFieldHelperTextFoundation, "defaultAdapter", {
            /**
             * See {@link MDCTextFieldHelperTextAdapter} for typing information on parameters and return types.
             */
            get: function () {
                // tslint:disable:object-literal-sort-keys Methods should be in the same order as the adapter interface.
                return {
                    addClass: function () { return undefined; },
                    removeClass: function () { return undefined; },
                    hasClass: function () { return false; },
                    setAttr: function () { return undefined; },
                    removeAttr: function () { return undefined; },
                    setContent: function () { return undefined; },
                };
                // tslint:enable:object-literal-sort-keys
            },
            enumerable: true,
            configurable: true
        });
        /**
         * Sets the content of the helper text field.
         */
        MDCTextFieldHelperTextFoundation.prototype.setContent = function (content) {
            this.adapter_.setContent(content);
        };
        /**
         * @param isPersistent Sets the persistency of the helper text.
         */
        MDCTextFieldHelperTextFoundation.prototype.setPersistent = function (isPersistent) {
            if (isPersistent) {
                this.adapter_.addClass(cssClasses$7.HELPER_TEXT_PERSISTENT);
            }
            else {
                this.adapter_.removeClass(cssClasses$7.HELPER_TEXT_PERSISTENT);
            }
        };
        /**
         * @param isValidation True to make the helper text act as an error validation message.
         */
        MDCTextFieldHelperTextFoundation.prototype.setValidation = function (isValidation) {
            if (isValidation) {
                this.adapter_.addClass(cssClasses$7.HELPER_TEXT_VALIDATION_MSG);
            }
            else {
                this.adapter_.removeClass(cssClasses$7.HELPER_TEXT_VALIDATION_MSG);
            }
        };
        /**
         * Makes the helper text visible to the screen reader.
         */
        MDCTextFieldHelperTextFoundation.prototype.showToScreenReader = function () {
            this.adapter_.removeAttr(strings$5.ARIA_HIDDEN);
        };
        /**
         * Sets the validity of the helper text based on the input validity.
         */
        MDCTextFieldHelperTextFoundation.prototype.setValidity = function (inputIsValid) {
            var helperTextIsPersistent = this.adapter_.hasClass(cssClasses$7.HELPER_TEXT_PERSISTENT);
            var helperTextIsValidationMsg = this.adapter_.hasClass(cssClasses$7.HELPER_TEXT_VALIDATION_MSG);
            var validationMsgNeedsDisplay = helperTextIsValidationMsg && !inputIsValid;
            if (validationMsgNeedsDisplay) {
                this.adapter_.setAttr(strings$5.ROLE, 'alert');
            }
            else {
                this.adapter_.removeAttr(strings$5.ROLE);
            }
            if (!helperTextIsPersistent && !validationMsgNeedsDisplay) {
                this.hide_();
            }
        };
        /**
         * Hides the help text from screen readers.
         */
        MDCTextFieldHelperTextFoundation.prototype.hide_ = function () {
            this.adapter_.setAttr(strings$5.ARIA_HIDDEN, 'true');
        };
        return MDCTextFieldHelperTextFoundation;
    }(MDCFoundation));

    /**
     * @license
     * Copyright 2017 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var MDCTextFieldHelperText = /** @class */ (function (_super) {
        __extends(MDCTextFieldHelperText, _super);
        function MDCTextFieldHelperText() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        MDCTextFieldHelperText.attachTo = function (root) {
            return new MDCTextFieldHelperText(root);
        };
        Object.defineProperty(MDCTextFieldHelperText.prototype, "foundation", {
            get: function () {
                return this.foundation_;
            },
            enumerable: true,
            configurable: true
        });
        MDCTextFieldHelperText.prototype.getDefaultFoundation = function () {
            var _this = this;
            // DO NOT INLINE this variable. For backward compatibility, foundations take a Partial<MDCFooAdapter>.
            // To ensure we don't accidentally omit any methods, we need a separate, strongly typed adapter variable.
            // tslint:disable:object-literal-sort-keys Methods should be in the same order as the adapter interface.
            var adapter = {
                addClass: function (className) { return _this.root_.classList.add(className); },
                removeClass: function (className) { return _this.root_.classList.remove(className); },
                hasClass: function (className) { return _this.root_.classList.contains(className); },
                setAttr: function (attr, value) { return _this.root_.setAttribute(attr, value); },
                removeAttr: function (attr) { return _this.root_.removeAttribute(attr); },
                setContent: function (content) {
                    _this.root_.textContent = content;
                },
            };
            // tslint:enable:object-literal-sort-keys
            return new MDCTextFieldHelperTextFoundation(adapter);
        };
        return MDCTextFieldHelperText;
    }(MDCComponent));

    /**
     * @license
     * Copyright 2016 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var strings$6 = {
        ICON_EVENT: 'MDCTextField:icon',
        ICON_ROLE: 'button',
    };
    var cssClasses$8 = {
        ROOT: 'mdc-text-field__icon',
    };

    /**
     * @license
     * Copyright 2017 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var INTERACTION_EVENTS$1 = ['click', 'keydown'];
    var MDCTextFieldIconFoundation = /** @class */ (function (_super) {
        __extends(MDCTextFieldIconFoundation, _super);
        function MDCTextFieldIconFoundation(adapter) {
            var _this = _super.call(this, __assign({}, MDCTextFieldIconFoundation.defaultAdapter, adapter)) || this;
            _this.savedTabIndex_ = null;
            _this.interactionHandler_ = function (evt) { return _this.handleInteraction(evt); };
            return _this;
        }
        Object.defineProperty(MDCTextFieldIconFoundation, "strings", {
            get: function () {
                return strings$6;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCTextFieldIconFoundation, "cssClasses", {
            get: function () {
                return cssClasses$8;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCTextFieldIconFoundation, "defaultAdapter", {
            /**
             * See {@link MDCTextFieldIconAdapter} for typing information on parameters and return types.
             */
            get: function () {
                // tslint:disable:object-literal-sort-keys Methods should be in the same order as the adapter interface.
                return {
                    getAttr: function () { return null; },
                    setAttr: function () { return undefined; },
                    removeAttr: function () { return undefined; },
                    setContent: function () { return undefined; },
                    registerInteractionHandler: function () { return undefined; },
                    deregisterInteractionHandler: function () { return undefined; },
                    notifyIconAction: function () { return undefined; },
                };
                // tslint:enable:object-literal-sort-keys
            },
            enumerable: true,
            configurable: true
        });
        MDCTextFieldIconFoundation.prototype.init = function () {
            var _this = this;
            this.savedTabIndex_ = this.adapter_.getAttr('tabindex');
            INTERACTION_EVENTS$1.forEach(function (evtType) {
                _this.adapter_.registerInteractionHandler(evtType, _this.interactionHandler_);
            });
        };
        MDCTextFieldIconFoundation.prototype.destroy = function () {
            var _this = this;
            INTERACTION_EVENTS$1.forEach(function (evtType) {
                _this.adapter_.deregisterInteractionHandler(evtType, _this.interactionHandler_);
            });
        };
        MDCTextFieldIconFoundation.prototype.setDisabled = function (disabled) {
            if (!this.savedTabIndex_) {
                return;
            }
            if (disabled) {
                this.adapter_.setAttr('tabindex', '-1');
                this.adapter_.removeAttr('role');
            }
            else {
                this.adapter_.setAttr('tabindex', this.savedTabIndex_);
                this.adapter_.setAttr('role', strings$6.ICON_ROLE);
            }
        };
        MDCTextFieldIconFoundation.prototype.setAriaLabel = function (label) {
            this.adapter_.setAttr('aria-label', label);
        };
        MDCTextFieldIconFoundation.prototype.setContent = function (content) {
            this.adapter_.setContent(content);
        };
        MDCTextFieldIconFoundation.prototype.handleInteraction = function (evt) {
            var isEnterKey = evt.key === 'Enter' || evt.keyCode === 13;
            if (evt.type === 'click' || isEnterKey) {
                this.adapter_.notifyIconAction();
            }
        };
        return MDCTextFieldIconFoundation;
    }(MDCFoundation));

    /**
     * @license
     * Copyright 2017 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var MDCTextFieldIcon = /** @class */ (function (_super) {
        __extends(MDCTextFieldIcon, _super);
        function MDCTextFieldIcon() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        MDCTextFieldIcon.attachTo = function (root) {
            return new MDCTextFieldIcon(root);
        };
        Object.defineProperty(MDCTextFieldIcon.prototype, "foundation", {
            get: function () {
                return this.foundation_;
            },
            enumerable: true,
            configurable: true
        });
        MDCTextFieldIcon.prototype.getDefaultFoundation = function () {
            var _this = this;
            // DO NOT INLINE this variable. For backward compatibility, foundations take a Partial<MDCFooAdapter>.
            // To ensure we don't accidentally omit any methods, we need a separate, strongly typed adapter variable.
            // tslint:disable:object-literal-sort-keys Methods should be in the same order as the adapter interface.
            var adapter = {
                getAttr: function (attr) { return _this.root_.getAttribute(attr); },
                setAttr: function (attr, value) { return _this.root_.setAttribute(attr, value); },
                removeAttr: function (attr) { return _this.root_.removeAttribute(attr); },
                setContent: function (content) {
                    _this.root_.textContent = content;
                },
                registerInteractionHandler: function (evtType, handler) { return _this.listen(evtType, handler); },
                deregisterInteractionHandler: function (evtType, handler) { return _this.unlisten(evtType, handler); },
                notifyIconAction: function () { return _this.emit(MDCTextFieldIconFoundation.strings.ICON_EVENT, {} /* evtData */, true /* shouldBubble */); },
            };
            // tslint:enable:object-literal-sort-keys
            return new MDCTextFieldIconFoundation(adapter);
        };
        return MDCTextFieldIcon;
    }(MDCComponent));

    /**
     * @license
     * Copyright 2016 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var MDCTextField = /** @class */ (function (_super) {
        __extends(MDCTextField, _super);
        function MDCTextField() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        MDCTextField.attachTo = function (root) {
            return new MDCTextField(root);
        };
        MDCTextField.prototype.initialize = function (rippleFactory, lineRippleFactory, helperTextFactory, characterCounterFactory, iconFactory, labelFactory, outlineFactory) {
            if (rippleFactory === void 0) { rippleFactory = function (el, foundation) { return new MDCRipple(el, foundation); }; }
            if (lineRippleFactory === void 0) { lineRippleFactory = function (el) { return new MDCLineRipple(el); }; }
            if (helperTextFactory === void 0) { helperTextFactory = function (el) { return new MDCTextFieldHelperText(el); }; }
            if (characterCounterFactory === void 0) { characterCounterFactory = function (el) { return new MDCTextFieldCharacterCounter(el); }; }
            if (iconFactory === void 0) { iconFactory = function (el) { return new MDCTextFieldIcon(el); }; }
            if (labelFactory === void 0) { labelFactory = function (el) { return new MDCFloatingLabel(el); }; }
            if (outlineFactory === void 0) { outlineFactory = function (el) { return new MDCNotchedOutline(el); }; }
            this.input_ = this.root_.querySelector(strings$4.INPUT_SELECTOR);
            var labelElement = this.root_.querySelector(strings$4.LABEL_SELECTOR);
            this.label_ = labelElement ? labelFactory(labelElement) : null;
            var lineRippleElement = this.root_.querySelector(strings$4.LINE_RIPPLE_SELECTOR);
            this.lineRipple_ = lineRippleElement ? lineRippleFactory(lineRippleElement) : null;
            var outlineElement = this.root_.querySelector(strings$4.OUTLINE_SELECTOR);
            this.outline_ = outlineElement ? outlineFactory(outlineElement) : null;
            // Helper text
            var helperTextStrings = MDCTextFieldHelperTextFoundation.strings;
            var nextElementSibling = this.root_.nextElementSibling;
            var hasHelperLine = (nextElementSibling && nextElementSibling.classList.contains(cssClasses$6.HELPER_LINE));
            var helperTextEl = hasHelperLine && nextElementSibling && nextElementSibling.querySelector(helperTextStrings.ROOT_SELECTOR);
            this.helperText_ = helperTextEl ? helperTextFactory(helperTextEl) : null;
            // Character counter
            var characterCounterStrings = MDCTextFieldCharacterCounterFoundation.strings;
            var characterCounterEl = this.root_.querySelector(characterCounterStrings.ROOT_SELECTOR);
            // If character counter is not found in root element search in sibling element.
            if (!characterCounterEl && hasHelperLine && nextElementSibling) {
                characterCounterEl = nextElementSibling.querySelector(characterCounterStrings.ROOT_SELECTOR);
            }
            this.characterCounter_ = characterCounterEl ? characterCounterFactory(characterCounterEl) : null;
            this.leadingIcon_ = null;
            this.trailingIcon_ = null;
            var iconElements = this.root_.querySelectorAll(strings$4.ICON_SELECTOR);
            if (iconElements.length > 0) {
                if (iconElements.length > 1) { // Has both icons.
                    this.leadingIcon_ = iconFactory(iconElements[0]);
                    this.trailingIcon_ = iconFactory(iconElements[1]);
                }
                else {
                    if (this.root_.classList.contains(cssClasses$6.WITH_LEADING_ICON)) {
                        this.leadingIcon_ = iconFactory(iconElements[0]);
                    }
                    else {
                        this.trailingIcon_ = iconFactory(iconElements[0]);
                    }
                }
            }
            this.ripple = this.createRipple_(rippleFactory);
        };
        MDCTextField.prototype.destroy = function () {
            if (this.ripple) {
                this.ripple.destroy();
            }
            if (this.lineRipple_) {
                this.lineRipple_.destroy();
            }
            if (this.helperText_) {
                this.helperText_.destroy();
            }
            if (this.characterCounter_) {
                this.characterCounter_.destroy();
            }
            if (this.leadingIcon_) {
                this.leadingIcon_.destroy();
            }
            if (this.trailingIcon_) {
                this.trailingIcon_.destroy();
            }
            if (this.label_) {
                this.label_.destroy();
            }
            if (this.outline_) {
                this.outline_.destroy();
            }
            _super.prototype.destroy.call(this);
        };
        /**
         * Initializes the Text Field's internal state based on the environment's
         * state.
         */
        MDCTextField.prototype.initialSyncWithDOM = function () {
            this.disabled = this.input_.disabled;
        };
        Object.defineProperty(MDCTextField.prototype, "value", {
            get: function () {
                return this.foundation_.getValue();
            },
            /**
             * @param value The value to set on the input.
             */
            set: function (value) {
                this.foundation_.setValue(value);
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCTextField.prototype, "disabled", {
            get: function () {
                return this.foundation_.isDisabled();
            },
            /**
             * @param disabled Sets the Text Field disabled or enabled.
             */
            set: function (disabled) {
                this.foundation_.setDisabled(disabled);
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCTextField.prototype, "valid", {
            get: function () {
                return this.foundation_.isValid();
            },
            /**
             * @param valid Sets the Text Field valid or invalid.
             */
            set: function (valid) {
                this.foundation_.setValid(valid);
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCTextField.prototype, "required", {
            get: function () {
                return this.input_.required;
            },
            /**
             * @param required Sets the Text Field to required.
             */
            set: function (required) {
                this.input_.required = required;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCTextField.prototype, "pattern", {
            get: function () {
                return this.input_.pattern;
            },
            /**
             * @param pattern Sets the input element's validation pattern.
             */
            set: function (pattern) {
                this.input_.pattern = pattern;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCTextField.prototype, "minLength", {
            get: function () {
                return this.input_.minLength;
            },
            /**
             * @param minLength Sets the input element's minLength.
             */
            set: function (minLength) {
                this.input_.minLength = minLength;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCTextField.prototype, "maxLength", {
            get: function () {
                return this.input_.maxLength;
            },
            /**
             * @param maxLength Sets the input element's maxLength.
             */
            set: function (maxLength) {
                // Chrome throws exception if maxLength is set to a value less than zero
                if (maxLength < 0) {
                    this.input_.removeAttribute('maxLength');
                }
                else {
                    this.input_.maxLength = maxLength;
                }
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCTextField.prototype, "min", {
            get: function () {
                return this.input_.min;
            },
            /**
             * @param min Sets the input element's min.
             */
            set: function (min) {
                this.input_.min = min;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCTextField.prototype, "max", {
            get: function () {
                return this.input_.max;
            },
            /**
             * @param max Sets the input element's max.
             */
            set: function (max) {
                this.input_.max = max;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCTextField.prototype, "step", {
            get: function () {
                return this.input_.step;
            },
            /**
             * @param step Sets the input element's step.
             */
            set: function (step) {
                this.input_.step = step;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCTextField.prototype, "helperTextContent", {
            /**
             * Sets the helper text element content.
             */
            set: function (content) {
                this.foundation_.setHelperTextContent(content);
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCTextField.prototype, "leadingIconAriaLabel", {
            /**
             * Sets the aria label of the leading icon.
             */
            set: function (label) {
                this.foundation_.setLeadingIconAriaLabel(label);
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCTextField.prototype, "leadingIconContent", {
            /**
             * Sets the text content of the leading icon.
             */
            set: function (content) {
                this.foundation_.setLeadingIconContent(content);
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCTextField.prototype, "trailingIconAriaLabel", {
            /**
             * Sets the aria label of the trailing icon.
             */
            set: function (label) {
                this.foundation_.setTrailingIconAriaLabel(label);
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCTextField.prototype, "trailingIconContent", {
            /**
             * Sets the text content of the trailing icon.
             */
            set: function (content) {
                this.foundation_.setTrailingIconContent(content);
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCTextField.prototype, "useNativeValidation", {
            /**
             * Enables or disables the use of native validation. Use this for custom validation.
             * @param useNativeValidation Set this to false to ignore native input validation.
             */
            set: function (useNativeValidation) {
                this.foundation_.setUseNativeValidation(useNativeValidation);
            },
            enumerable: true,
            configurable: true
        });
        /**
         * Focuses the input element.
         */
        MDCTextField.prototype.focus = function () {
            this.input_.focus();
        };
        /**
         * Recomputes the outline SVG path for the outline element.
         */
        MDCTextField.prototype.layout = function () {
            var openNotch = this.foundation_.shouldFloat;
            this.foundation_.notchOutline(openNotch);
        };
        MDCTextField.prototype.getDefaultFoundation = function () {
            // DO NOT INLINE this variable. For backward compatibility, foundations take a Partial<MDCFooAdapter>.
            // To ensure we don't accidentally omit any methods, we need a separate, strongly typed adapter variable.
            // tslint:disable:object-literal-sort-keys Methods should be in the same order as the adapter interface.
            var adapter = __assign({}, this.getRootAdapterMethods_(), this.getInputAdapterMethods_(), this.getLabelAdapterMethods_(), this.getLineRippleAdapterMethods_(), this.getOutlineAdapterMethods_());
            // tslint:enable:object-literal-sort-keys
            return new MDCTextFieldFoundation(adapter, this.getFoundationMap_());
        };
        MDCTextField.prototype.getRootAdapterMethods_ = function () {
            var _this = this;
            // tslint:disable:object-literal-sort-keys Methods should be in the same order as the adapter interface.
            return {
                addClass: function (className) { return _this.root_.classList.add(className); },
                removeClass: function (className) { return _this.root_.classList.remove(className); },
                hasClass: function (className) { return _this.root_.classList.contains(className); },
                registerTextFieldInteractionHandler: function (evtType, handler) { return _this.listen(evtType, handler); },
                deregisterTextFieldInteractionHandler: function (evtType, handler) { return _this.unlisten(evtType, handler); },
                registerValidationAttributeChangeHandler: function (handler) {
                    var getAttributesList = function (mutationsList) {
                        return mutationsList
                            .map(function (mutation) { return mutation.attributeName; })
                            .filter(function (attributeName) { return attributeName; });
                    };
                    var observer = new MutationObserver(function (mutationsList) { return handler(getAttributesList(mutationsList)); });
                    var config = { attributes: true };
                    observer.observe(_this.input_, config);
                    return observer;
                },
                deregisterValidationAttributeChangeHandler: function (observer) { return observer.disconnect(); },
            };
            // tslint:enable:object-literal-sort-keys
        };
        MDCTextField.prototype.getInputAdapterMethods_ = function () {
            var _this = this;
            // tslint:disable:object-literal-sort-keys Methods should be in the same order as the adapter interface.
            return {
                getNativeInput: function () { return _this.input_; },
                isFocused: function () { return document.activeElement === _this.input_; },
                registerInputInteractionHandler: function (evtType, handler) {
                    return _this.input_.addEventListener(evtType, handler, applyPassive());
                },
                deregisterInputInteractionHandler: function (evtType, handler) {
                    return _this.input_.removeEventListener(evtType, handler, applyPassive());
                },
            };
            // tslint:enable:object-literal-sort-keys
        };
        MDCTextField.prototype.getLabelAdapterMethods_ = function () {
            var _this = this;
            return {
                floatLabel: function (shouldFloat) { return _this.label_ && _this.label_.float(shouldFloat); },
                getLabelWidth: function () { return _this.label_ ? _this.label_.getWidth() : 0; },
                hasLabel: function () { return Boolean(_this.label_); },
                shakeLabel: function (shouldShake) { return _this.label_ && _this.label_.shake(shouldShake); },
            };
        };
        MDCTextField.prototype.getLineRippleAdapterMethods_ = function () {
            var _this = this;
            return {
                activateLineRipple: function () {
                    if (_this.lineRipple_) {
                        _this.lineRipple_.activate();
                    }
                },
                deactivateLineRipple: function () {
                    if (_this.lineRipple_) {
                        _this.lineRipple_.deactivate();
                    }
                },
                setLineRippleTransformOrigin: function (normalizedX) {
                    if (_this.lineRipple_) {
                        _this.lineRipple_.setRippleCenter(normalizedX);
                    }
                },
            };
        };
        MDCTextField.prototype.getOutlineAdapterMethods_ = function () {
            var _this = this;
            return {
                closeOutline: function () { return _this.outline_ && _this.outline_.closeNotch(); },
                hasOutline: function () { return Boolean(_this.outline_); },
                notchOutline: function (labelWidth) { return _this.outline_ && _this.outline_.notch(labelWidth); },
            };
        };
        /**
         * @return A map of all subcomponents to subfoundations.
         */
        MDCTextField.prototype.getFoundationMap_ = function () {
            return {
                characterCounter: this.characterCounter_ ? this.characterCounter_.foundation : undefined,
                helperText: this.helperText_ ? this.helperText_.foundation : undefined,
                leadingIcon: this.leadingIcon_ ? this.leadingIcon_.foundation : undefined,
                trailingIcon: this.trailingIcon_ ? this.trailingIcon_.foundation : undefined,
            };
        };
        MDCTextField.prototype.createRipple_ = function (rippleFactory) {
            var _this = this;
            var isTextArea = this.root_.classList.contains(cssClasses$6.TEXTAREA);
            var isOutlined = this.root_.classList.contains(cssClasses$6.OUTLINED);
            if (isTextArea || isOutlined) {
                return null;
            }
            // DO NOT INLINE this variable. For backward compatibility, foundations take a Partial<MDCFooAdapter>.
            // To ensure we don't accidentally omit any methods, we need a separate, strongly typed adapter variable.
            // tslint:disable:object-literal-sort-keys Methods should be in the same order as the adapter interface.
            var adapter = __assign({}, MDCRipple.createAdapter(this), { isSurfaceActive: function () { return matches(_this.input_, ':active'); }, registerInteractionHandler: function (evtType, handler) { return _this.input_.addEventListener(evtType, handler, applyPassive()); }, deregisterInteractionHandler: function (evtType, handler) {
                    return _this.input_.removeEventListener(evtType, handler, applyPassive());
                } });
            // tslint:enable:object-literal-sort-keys
            return rippleFactory(this.root_, new MDCRippleFoundation(adapter));
        };
        return MDCTextField;
    }(MDCComponent));

    function prefixFilter(obj, prefix) {
      let names = Object.getOwnPropertyNames(obj);
      const newObj = {};

      for (let i = 0; i < names.length; i++) {
        const name = names[i];
        if (name.substring(0, prefix.length) === prefix) {
          newObj[name.substring(prefix.length)] = obj[name];
        }
      }

      return newObj;
    }

    /* node_modules/@smui/floating-label/FloatingLabel.svelte generated by Svelte v3.19.1 */

    function create_else_block(ctx) {
    	let label;
    	let useActions_action;
    	let forwardEvents_action;
    	let current;
    	let dispose;
    	const default_slot_template = /*$$slots*/ ctx[13].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[12], null);

    	let label_levels = [
    		{
    			class: "mdc-floating-label " + /*className*/ ctx[1]
    		},
    		/*forId*/ ctx[2] || /*inputProps*/ ctx[6] && /*inputProps*/ ctx[6].id
    		? {
    				"for": /*forId*/ ctx[2] || /*inputProps*/ ctx[6] && /*inputProps*/ ctx[6].id
    			}
    		: {},
    		exclude(/*$$props*/ ctx[7], ["use", "class", "for", "wrapped"])
    	];

    	let label_data = {};

    	for (let i = 0; i < label_levels.length; i += 1) {
    		label_data = assign(label_data, label_levels[i]);
    	}

    	return {
    		c() {
    			label = element("label");
    			if (default_slot) default_slot.c();
    			set_attributes(label, label_data);
    		},
    		m(target, anchor) {
    			insert(target, label, anchor);

    			if (default_slot) {
    				default_slot.m(label, null);
    			}

    			/*label_binding*/ ctx[15](label);
    			current = true;

    			dispose = [
    				action_destroyer(useActions_action = useActions.call(null, label, /*use*/ ctx[0])),
    				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[5].call(null, label))
    			];
    		},
    		p(ctx, dirty) {
    			if (default_slot && default_slot.p && dirty & /*$$scope*/ 4096) {
    				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[12], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[12], dirty, null));
    			}

    			set_attributes(label, get_spread_update(label_levels, [
    				dirty & /*className*/ 2 && {
    					class: "mdc-floating-label " + /*className*/ ctx[1]
    				},
    				dirty & /*forId, inputProps*/ 68 && (/*forId*/ ctx[2] || /*inputProps*/ ctx[6] && /*inputProps*/ ctx[6].id
    				? {
    						"for": /*forId*/ ctx[2] || /*inputProps*/ ctx[6] && /*inputProps*/ ctx[6].id
    					}
    				: {}),
    				dirty & /*exclude, $$props*/ 128 && exclude(/*$$props*/ ctx[7], ["use", "class", "for", "wrapped"])
    			]));

    			if (useActions_action && is_function(useActions_action.update) && dirty & /*use*/ 1) useActions_action.update.call(null, /*use*/ ctx[0]);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(label);
    			if (default_slot) default_slot.d(detaching);
    			/*label_binding*/ ctx[15](null);
    			run_all(dispose);
    		}
    	};
    }

    // (1:0) {#if wrapped}
    function create_if_block$1(ctx) {
    	let span;
    	let useActions_action;
    	let forwardEvents_action;
    	let current;
    	let dispose;
    	const default_slot_template = /*$$slots*/ ctx[13].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[12], null);

    	let span_levels = [
    		{
    			class: "mdc-floating-label " + /*className*/ ctx[1]
    		},
    		exclude(/*$$props*/ ctx[7], ["use", "class", "wrapped"])
    	];

    	let span_data = {};

    	for (let i = 0; i < span_levels.length; i += 1) {
    		span_data = assign(span_data, span_levels[i]);
    	}

    	return {
    		c() {
    			span = element("span");
    			if (default_slot) default_slot.c();
    			set_attributes(span, span_data);
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);

    			if (default_slot) {
    				default_slot.m(span, null);
    			}

    			/*span_binding*/ ctx[14](span);
    			current = true;

    			dispose = [
    				action_destroyer(useActions_action = useActions.call(null, span, /*use*/ ctx[0])),
    				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[5].call(null, span))
    			];
    		},
    		p(ctx, dirty) {
    			if (default_slot && default_slot.p && dirty & /*$$scope*/ 4096) {
    				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[12], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[12], dirty, null));
    			}

    			set_attributes(span, get_spread_update(span_levels, [
    				dirty & /*className*/ 2 && {
    					class: "mdc-floating-label " + /*className*/ ctx[1]
    				},
    				dirty & /*exclude, $$props*/ 128 && exclude(/*$$props*/ ctx[7], ["use", "class", "wrapped"])
    			]));

    			if (useActions_action && is_function(useActions_action.update) && dirty & /*use*/ 1) useActions_action.update.call(null, /*use*/ ctx[0]);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    			if (default_slot) default_slot.d(detaching);
    			/*span_binding*/ ctx[14](null);
    			run_all(dispose);
    		}
    	};
    }

    function create_fragment$2(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block$1, create_else_block];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*wrapped*/ ctx[3]) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	return {
    		c() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in(if_block, 1);
    				if_block.m(if_block_anchor.parentNode, if_block_anchor);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function instance$2($$self, $$props, $$invalidate) {
    	const forwardEvents = forwardEventsBuilder(current_component);
    	let { use = [] } = $$props;
    	let { class: className = "" } = $$props;
    	let { for: forId = "" } = $$props;
    	let { wrapped = false } = $$props;
    	let element;
    	let floatingLabel;
    	let inputProps = getContext("SMUI:generic:input:props") || {};

    	onMount(() => {
    		floatingLabel = new MDCFloatingLabel(element);
    	});

    	onDestroy(() => {
    		floatingLabel && floatingLabel.destroy();
    	});

    	function shake(shouldShake, ...args) {
    		return floatingLabel.shake(shouldShake, ...args);
    	}

    	function float(shouldFloat, ...args) {
    		return floatingLabel.float(shouldFloat, ...args);
    	}

    	function getWidth(...args) {
    		return floatingLabel.getWidth(...args);
    	}

    	let { $$slots = {}, $$scope } = $$props;

    	function span_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(4, element = $$value);
    		});
    	}

    	function label_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(4, element = $$value);
    		});
    	}

    	$$self.$set = $$new_props => {
    		$$invalidate(7, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		if ("use" in $$new_props) $$invalidate(0, use = $$new_props.use);
    		if ("class" in $$new_props) $$invalidate(1, className = $$new_props.class);
    		if ("for" in $$new_props) $$invalidate(2, forId = $$new_props.for);
    		if ("wrapped" in $$new_props) $$invalidate(3, wrapped = $$new_props.wrapped);
    		if ("$$scope" in $$new_props) $$invalidate(12, $$scope = $$new_props.$$scope);
    	};

    	$$props = exclude_internal_props($$props);

    	return [
    		use,
    		className,
    		forId,
    		wrapped,
    		element,
    		forwardEvents,
    		inputProps,
    		$$props,
    		shake,
    		float,
    		getWidth,
    		floatingLabel,
    		$$scope,
    		$$slots,
    		span_binding,
    		label_binding
    	];
    }

    class FloatingLabel extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$2, create_fragment$2, safe_not_equal, {
    			use: 0,
    			class: 1,
    			for: 2,
    			wrapped: 3,
    			shake: 8,
    			float: 9,
    			getWidth: 10
    		});
    	}

    	get shake() {
    		return this.$$.ctx[8];
    	}

    	get float() {
    		return this.$$.ctx[9];
    	}

    	get getWidth() {
    		return this.$$.ctx[10];
    	}
    }

    /* node_modules/@smui/line-ripple/LineRipple.svelte generated by Svelte v3.19.1 */

    function create_fragment$3(ctx) {
    	let div;
    	let useActions_action;
    	let forwardEvents_action;
    	let dispose;

    	let div_levels = [
    		{
    			class: "\n    mdc-line-ripple\n    " + /*className*/ ctx[1] + "\n    " + (/*active*/ ctx[2] ? "mdc-line-ripple--active" : "") + "\n  "
    		},
    		exclude(/*$$props*/ ctx[5], ["use", "class", "active"])
    	];

    	let div_data = {};

    	for (let i = 0; i < div_levels.length; i += 1) {
    		div_data = assign(div_data, div_levels[i]);
    	}

    	return {
    		c() {
    			div = element("div");
    			set_attributes(div, div_data);
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			/*div_binding*/ ctx[10](div);

    			dispose = [
    				action_destroyer(useActions_action = useActions.call(null, div, /*use*/ ctx[0])),
    				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[4].call(null, div))
    			];
    		},
    		p(ctx, [dirty]) {
    			set_attributes(div, get_spread_update(div_levels, [
    				dirty & /*className, active*/ 6 && {
    					class: "\n    mdc-line-ripple\n    " + /*className*/ ctx[1] + "\n    " + (/*active*/ ctx[2] ? "mdc-line-ripple--active" : "") + "\n  "
    				},
    				dirty & /*exclude, $$props*/ 32 && exclude(/*$$props*/ ctx[5], ["use", "class", "active"])
    			]));

    			if (useActions_action && is_function(useActions_action.update) && dirty & /*use*/ 1) useActions_action.update.call(null, /*use*/ ctx[0]);
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div);
    			/*div_binding*/ ctx[10](null);
    			run_all(dispose);
    		}
    	};
    }

    function instance$3($$self, $$props, $$invalidate) {
    	const forwardEvents = forwardEventsBuilder(current_component);
    	let { use = [] } = $$props;
    	let { class: className = "" } = $$props;
    	let { active = false } = $$props;
    	let element;
    	let lineRipple;

    	onMount(() => {
    		lineRipple = new MDCLineRipple(element);
    	});

    	onDestroy(() => {
    		lineRipple && lineRipple.destroy();
    	});

    	function activate(...args) {
    		return lineRipple.activate(...args);
    	}

    	function deactivate(...args) {
    		return lineRipple.deactivate(...args);
    	}

    	function setRippleCenter(xCoordinate, ...args) {
    		return lineRipple.setRippleCenter(xCoordinate, ...args);
    	}

    	function div_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(3, element = $$value);
    		});
    	}

    	$$self.$set = $$new_props => {
    		$$invalidate(5, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		if ("use" in $$new_props) $$invalidate(0, use = $$new_props.use);
    		if ("class" in $$new_props) $$invalidate(1, className = $$new_props.class);
    		if ("active" in $$new_props) $$invalidate(2, active = $$new_props.active);
    	};

    	$$props = exclude_internal_props($$props);

    	return [
    		use,
    		className,
    		active,
    		element,
    		forwardEvents,
    		$$props,
    		activate,
    		deactivate,
    		setRippleCenter,
    		lineRipple,
    		div_binding
    	];
    }

    class LineRipple extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$3, create_fragment$3, safe_not_equal, {
    			use: 0,
    			class: 1,
    			active: 2,
    			activate: 6,
    			deactivate: 7,
    			setRippleCenter: 8
    		});
    	}

    	get activate() {
    		return this.$$.ctx[6];
    	}

    	get deactivate() {
    		return this.$$.ctx[7];
    	}

    	get setRippleCenter() {
    		return this.$$.ctx[8];
    	}
    }

    /* node_modules/@smui/notched-outline/NotchedOutline.svelte generated by Svelte v3.19.1 */

    function create_if_block$2(ctx) {
    	let div;
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[11].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[10], null);

    	return {
    		c() {
    			div = element("div");
    			if (default_slot) default_slot.c();
    			attr(div, "class", "mdc-notched-outline__notch");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (default_slot && default_slot.p && dirty & /*$$scope*/ 1024) {
    				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[10], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[10], dirty, null));
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function create_fragment$4(ctx) {
    	let div2;
    	let div0;
    	let t0;
    	let t1;
    	let div1;
    	let useActions_action;
    	let forwardEvents_action;
    	let current;
    	let dispose;
    	let if_block = !/*noLabel*/ ctx[3] && create_if_block$2(ctx);

    	let div2_levels = [
    		{
    			class: "\n    mdc-notched-outline\n    " + /*className*/ ctx[1] + "\n    " + (/*notched*/ ctx[2] ? "mdc-notched-outline--notched" : "") + "\n    " + (/*noLabel*/ ctx[3]
    			? "mdc-notched-outline--no-label"
    			: "") + "\n  "
    		},
    		exclude(/*$$props*/ ctx[6], ["use", "class", "notched", "noLabel"])
    	];

    	let div2_data = {};

    	for (let i = 0; i < div2_levels.length; i += 1) {
    		div2_data = assign(div2_data, div2_levels[i]);
    	}

    	return {
    		c() {
    			div2 = element("div");
    			div0 = element("div");
    			t0 = space();
    			if (if_block) if_block.c();
    			t1 = space();
    			div1 = element("div");
    			attr(div0, "class", "mdc-notched-outline__leading");
    			attr(div1, "class", "mdc-notched-outline__trailing");
    			set_attributes(div2, div2_data);
    		},
    		m(target, anchor) {
    			insert(target, div2, anchor);
    			append(div2, div0);
    			append(div2, t0);
    			if (if_block) if_block.m(div2, null);
    			append(div2, t1);
    			append(div2, div1);
    			/*div2_binding*/ ctx[12](div2);
    			current = true;

    			dispose = [
    				action_destroyer(useActions_action = useActions.call(null, div2, /*use*/ ctx[0])),
    				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[5].call(null, div2))
    			];
    		},
    		p(ctx, [dirty]) {
    			if (!/*noLabel*/ ctx[3]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    					transition_in(if_block, 1);
    				} else {
    					if_block = create_if_block$2(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(div2, t1);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}

    			set_attributes(div2, get_spread_update(div2_levels, [
    				dirty & /*className, notched, noLabel*/ 14 && {
    					class: "\n    mdc-notched-outline\n    " + /*className*/ ctx[1] + "\n    " + (/*notched*/ ctx[2] ? "mdc-notched-outline--notched" : "") + "\n    " + (/*noLabel*/ ctx[3]
    					? "mdc-notched-outline--no-label"
    					: "") + "\n  "
    				},
    				dirty & /*exclude, $$props*/ 64 && exclude(/*$$props*/ ctx[6], ["use", "class", "notched", "noLabel"])
    			]));

    			if (useActions_action && is_function(useActions_action.update) && dirty & /*use*/ 1) useActions_action.update.call(null, /*use*/ ctx[0]);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div2);
    			if (if_block) if_block.d();
    			/*div2_binding*/ ctx[12](null);
    			run_all(dispose);
    		}
    	};
    }

    function instance$4($$self, $$props, $$invalidate) {
    	const forwardEvents = forwardEventsBuilder(current_component);
    	let { use = [] } = $$props;
    	let { class: className = "" } = $$props;
    	let { notched = false } = $$props;
    	let { noLabel = false } = $$props;
    	let element;
    	let notchedOutline;

    	onMount(() => {
    		notchedOutline = new MDCNotchedOutline(element);
    	});

    	onDestroy(() => {
    		notchedOutline && notchedOutline.destroy();
    	});

    	function notch(notchWidth, ...args) {
    		return notchedOutline.notch(notchWidth, ...args);
    	}

    	function closeNotch(...args) {
    		return notchedOutline.closeNotch(...args);
    	}

    	let { $$slots = {}, $$scope } = $$props;

    	function div2_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(4, element = $$value);
    		});
    	}

    	$$self.$set = $$new_props => {
    		$$invalidate(6, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		if ("use" in $$new_props) $$invalidate(0, use = $$new_props.use);
    		if ("class" in $$new_props) $$invalidate(1, className = $$new_props.class);
    		if ("notched" in $$new_props) $$invalidate(2, notched = $$new_props.notched);
    		if ("noLabel" in $$new_props) $$invalidate(3, noLabel = $$new_props.noLabel);
    		if ("$$scope" in $$new_props) $$invalidate(10, $$scope = $$new_props.$$scope);
    	};

    	$$props = exclude_internal_props($$props);

    	return [
    		use,
    		className,
    		notched,
    		noLabel,
    		element,
    		forwardEvents,
    		$$props,
    		notch,
    		closeNotch,
    		notchedOutline,
    		$$scope,
    		$$slots,
    		div2_binding
    	];
    }

    class NotchedOutline extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$4, create_fragment$4, safe_not_equal, {
    			use: 0,
    			class: 1,
    			notched: 2,
    			noLabel: 3,
    			notch: 7,
    			closeNotch: 8
    		});
    	}

    	get notch() {
    		return this.$$.ctx[7];
    	}

    	get closeNotch() {
    		return this.$$.ctx[8];
    	}
    }

    /* node_modules/@smui/textfield/Input.svelte generated by Svelte v3.19.1 */

    function create_fragment$5(ctx) {
    	let input;
    	let useActions_action;
    	let forwardEvents_action;
    	let dispose;

    	let input_levels = [
    		{
    			class: "mdc-text-field__input " + /*className*/ ctx[1]
    		},
    		{ type: /*type*/ ctx[2] },
    		/*valueProp*/ ctx[4],
    		exclude(/*$$props*/ ctx[8], [
    			"use",
    			"class",
    			"type",
    			"value",
    			"files",
    			"dirty",
    			"invalid",
    			"updateInvalid"
    		])
    	];

    	let input_data = {};

    	for (let i = 0; i < input_levels.length; i += 1) {
    		input_data = assign(input_data, input_levels[i]);
    	}

    	return {
    		c() {
    			input = element("input");
    			set_attributes(input, input_data);
    		},
    		m(target, anchor) {
    			insert(target, input, anchor);
    			/*input_binding*/ ctx[14](input);

    			dispose = [
    				action_destroyer(useActions_action = useActions.call(null, input, /*use*/ ctx[0])),
    				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[5].call(null, input)),
    				listen(input, "change", /*change_handler*/ ctx[15]),
    				listen(input, "input", /*input_handler*/ ctx[16]),
    				listen(input, "change", /*changeHandler*/ ctx[7])
    			];
    		},
    		p(ctx, [dirty]) {
    			set_attributes(input, get_spread_update(input_levels, [
    				dirty & /*className*/ 2 && {
    					class: "mdc-text-field__input " + /*className*/ ctx[1]
    				},
    				dirty & /*type*/ 4 && { type: /*type*/ ctx[2] },
    				dirty & /*valueProp*/ 16 && /*valueProp*/ ctx[4],
    				dirty & /*exclude, $$props*/ 256 && exclude(/*$$props*/ ctx[8], [
    					"use",
    					"class",
    					"type",
    					"value",
    					"files",
    					"dirty",
    					"invalid",
    					"updateInvalid"
    				])
    			]));

    			if (useActions_action && is_function(useActions_action.update) && dirty & /*use*/ 1) useActions_action.update.call(null, /*use*/ ctx[0]);
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(input);
    			/*input_binding*/ ctx[14](null);
    			run_all(dispose);
    		}
    	};
    }

    function toNumber(value) {
    	if (value === "") {
    		const nan = new Number(Number.NaN);
    		nan.length = 0;
    		return nan;
    	}

    	return +value;
    }

    function instance$5($$self, $$props, $$invalidate) {
    	const forwardEvents = forwardEventsBuilder(current_component, ["change", "input"]);
    	let { use = [] } = $$props;
    	let { class: className = "" } = $$props;
    	let { type = "text" } = $$props;
    	let { value = "" } = $$props;
    	let { files = undefined } = $$props;
    	let { dirty = false } = $$props;
    	let { invalid = false } = $$props;
    	let { updateInvalid = true } = $$props;
    	let element;
    	let valueProp = {};

    	onMount(() => {
    		if (updateInvalid) {
    			$$invalidate(12, invalid = element.matches(":invalid"));
    		}
    	});

    	function valueUpdater(e) {
    		switch (type) {
    			case "number":
    			case "range":
    				$$invalidate(9, value = toNumber(e.target.value));
    				break;
    			case "file":
    				$$invalidate(10, files = e.target.files);
    			default:
    				$$invalidate(9, value = e.target.value);
    				break;
    		}
    	}

    	function changeHandler(e) {
    		$$invalidate(11, dirty = true);

    		if (updateInvalid) {
    			$$invalidate(12, invalid = element.matches(":invalid"));
    		}
    	}

    	function input_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(3, element = $$value);
    		});
    	}

    	const change_handler = e => (type === "file" || type === "range") && valueUpdater(e);
    	const input_handler = e => type !== "file" && valueUpdater(e);

    	$$self.$set = $$new_props => {
    		$$invalidate(8, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		if ("use" in $$new_props) $$invalidate(0, use = $$new_props.use);
    		if ("class" in $$new_props) $$invalidate(1, className = $$new_props.class);
    		if ("type" in $$new_props) $$invalidate(2, type = $$new_props.type);
    		if ("value" in $$new_props) $$invalidate(9, value = $$new_props.value);
    		if ("files" in $$new_props) $$invalidate(10, files = $$new_props.files);
    		if ("dirty" in $$new_props) $$invalidate(11, dirty = $$new_props.dirty);
    		if ("invalid" in $$new_props) $$invalidate(12, invalid = $$new_props.invalid);
    		if ("updateInvalid" in $$new_props) $$invalidate(13, updateInvalid = $$new_props.updateInvalid);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*type, valueProp, value*/ 532) {
    			 if (type === "file") {
    				delete valueProp.value;
    			} else {
    				$$invalidate(4, valueProp.value = value === undefined ? "" : value, valueProp);
    			}
    		}
    	};

    	$$props = exclude_internal_props($$props);

    	return [
    		use,
    		className,
    		type,
    		element,
    		valueProp,
    		forwardEvents,
    		valueUpdater,
    		changeHandler,
    		$$props,
    		value,
    		files,
    		dirty,
    		invalid,
    		updateInvalid,
    		input_binding,
    		change_handler,
    		input_handler
    	];
    }

    class Input extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$5, create_fragment$5, safe_not_equal, {
    			use: 0,
    			class: 1,
    			type: 2,
    			value: 9,
    			files: 10,
    			dirty: 11,
    			invalid: 12,
    			updateInvalid: 13
    		});
    	}
    }

    /* node_modules/@smui/textfield/Textarea.svelte generated by Svelte v3.19.1 */

    function create_fragment$6(ctx) {
    	let textarea;
    	let useActions_action;
    	let forwardEvents_action;
    	let dispose;

    	let textarea_levels = [
    		{
    			class: "mdc-text-field__input " + /*className*/ ctx[2]
    		},
    		exclude(/*$$props*/ ctx[6], ["use", "class", "value", "dirty", "invalid", "updateInvalid"])
    	];

    	let textarea_data = {};

    	for (let i = 0; i < textarea_levels.length; i += 1) {
    		textarea_data = assign(textarea_data, textarea_levels[i]);
    	}

    	return {
    		c() {
    			textarea = element("textarea");
    			set_attributes(textarea, textarea_data);
    		},
    		m(target, anchor) {
    			insert(target, textarea, anchor);
    			/*textarea_binding*/ ctx[10](textarea);
    			set_input_value(textarea, /*value*/ ctx[0]);

    			dispose = [
    				action_destroyer(useActions_action = useActions.call(null, textarea, /*use*/ ctx[1])),
    				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[4].call(null, textarea)),
    				listen(textarea, "input", /*textarea_input_handler*/ ctx[11]),
    				listen(textarea, "change", /*changeHandler*/ ctx[5])
    			];
    		},
    		p(ctx, [dirty]) {
    			set_attributes(textarea, get_spread_update(textarea_levels, [
    				dirty & /*className*/ 4 && {
    					class: "mdc-text-field__input " + /*className*/ ctx[2]
    				},
    				dirty & /*exclude, $$props*/ 64 && exclude(/*$$props*/ ctx[6], ["use", "class", "value", "dirty", "invalid", "updateInvalid"])
    			]));

    			if (useActions_action && is_function(useActions_action.update) && dirty & /*use*/ 2) useActions_action.update.call(null, /*use*/ ctx[1]);

    			if (dirty & /*value*/ 1) {
    				set_input_value(textarea, /*value*/ ctx[0]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(textarea);
    			/*textarea_binding*/ ctx[10](null);
    			run_all(dispose);
    		}
    	};
    }

    function instance$6($$self, $$props, $$invalidate) {
    	const forwardEvents = forwardEventsBuilder(current_component, ["change", "input"]);
    	let { use = [] } = $$props;
    	let { class: className = "" } = $$props;
    	let { value = "" } = $$props;
    	let { dirty = false } = $$props;
    	let { invalid = false } = $$props;
    	let { updateInvalid = true } = $$props;
    	let element;

    	onMount(() => {
    		if (updateInvalid) {
    			$$invalidate(8, invalid = element.matches(":invalid"));
    		}
    	});

    	function changeHandler() {
    		$$invalidate(7, dirty = true);

    		if (updateInvalid) {
    			$$invalidate(8, invalid = element.matches(":invalid"));
    		}
    	}

    	function textarea_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(3, element = $$value);
    		});
    	}

    	function textarea_input_handler() {
    		value = this.value;
    		$$invalidate(0, value);
    	}

    	$$self.$set = $$new_props => {
    		$$invalidate(6, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		if ("use" in $$new_props) $$invalidate(1, use = $$new_props.use);
    		if ("class" in $$new_props) $$invalidate(2, className = $$new_props.class);
    		if ("value" in $$new_props) $$invalidate(0, value = $$new_props.value);
    		if ("dirty" in $$new_props) $$invalidate(7, dirty = $$new_props.dirty);
    		if ("invalid" in $$new_props) $$invalidate(8, invalid = $$new_props.invalid);
    		if ("updateInvalid" in $$new_props) $$invalidate(9, updateInvalid = $$new_props.updateInvalid);
    	};

    	$$props = exclude_internal_props($$props);

    	return [
    		value,
    		use,
    		className,
    		element,
    		forwardEvents,
    		changeHandler,
    		$$props,
    		dirty,
    		invalid,
    		updateInvalid,
    		textarea_binding,
    		textarea_input_handler
    	];
    }

    class Textarea extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$6, create_fragment$6, safe_not_equal, {
    			use: 1,
    			class: 2,
    			value: 0,
    			dirty: 7,
    			invalid: 8,
    			updateInvalid: 9
    		});
    	}
    }

    /* node_modules/@smui/textfield/Textfield.svelte generated by Svelte v3.19.1 */
    const get_label_slot_changes_1 = dirty => ({});
    const get_label_slot_context_1 = ctx => ({});
    const get_label_slot_changes = dirty => ({});
    const get_label_slot_context = ctx => ({});

    // (65:0) {:else}
    function create_else_block_1(ctx) {
    	let div;
    	let useActions_action;
    	let forwardEvents_action;
    	let current;
    	let dispose;
    	const default_slot_template = /*$$slots*/ ctx[30].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[44], null);

    	let div_levels = [
    		{
    			class: "\n      mdc-text-field\n      " + /*className*/ ctx[5] + "\n      " + (/*disabled*/ ctx[7] ? "mdc-text-field--disabled" : "") + "\n      " + (/*fullwidth*/ ctx[8] ? "mdc-text-field--fullwidth" : "") + "\n      " + (/*textarea*/ ctx[9] ? "mdc-text-field--textarea" : "") + "\n      " + (/*variant*/ ctx[10] === "outlined" && !/*fullwidth*/ ctx[8]
    			? "mdc-text-field--outlined"
    			: "") + "\n      " + (/*variant*/ ctx[10] === "standard" && !/*fullwidth*/ ctx[8] && !/*textarea*/ ctx[9]
    			? "smui-text-field--standard"
    			: "") + "\n      " + (/*dense*/ ctx[11] ? "mdc-text-field--dense" : "") + "\n      " + (/*noLabel*/ ctx[14] ? "mdc-text-field--no-label" : "") + "\n      " + (/*withLeadingIcon*/ ctx[12]
    			? "mdc-text-field--with-leading-icon"
    			: "") + "\n      " + (/*withTrailingIcon*/ ctx[13]
    			? "mdc-text-field--with-trailing-icon"
    			: "") + "\n      " + (/*invalid*/ ctx[3] ? "mdc-text-field--invalid" : "") + "\n    "
    		},
    		/*props*/ ctx[19]
    	];

    	let div_data = {};

    	for (let i = 0; i < div_levels.length; i += 1) {
    		div_data = assign(div_data, div_levels[i]);
    	}

    	return {
    		c() {
    			div = element("div");
    			if (default_slot) default_slot.c();
    			set_attributes(div, div_data);
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			/*div_binding*/ ctx[43](div);
    			current = true;

    			dispose = [
    				action_destroyer(useActions_action = useActions.call(null, div, /*use*/ ctx[4])),
    				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[21].call(null, div))
    			];
    		},
    		p(ctx, dirty) {
    			if (default_slot && default_slot.p && dirty[1] & /*$$scope*/ 8192) {
    				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[44], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[44], dirty, null));
    			}

    			set_attributes(div, get_spread_update(div_levels, [
    				dirty[0] & /*className, disabled, fullwidth, textarea, variant, dense, noLabel, withLeadingIcon, withTrailingIcon, invalid*/ 32680 && {
    					class: "\n      mdc-text-field\n      " + /*className*/ ctx[5] + "\n      " + (/*disabled*/ ctx[7] ? "mdc-text-field--disabled" : "") + "\n      " + (/*fullwidth*/ ctx[8] ? "mdc-text-field--fullwidth" : "") + "\n      " + (/*textarea*/ ctx[9] ? "mdc-text-field--textarea" : "") + "\n      " + (/*variant*/ ctx[10] === "outlined" && !/*fullwidth*/ ctx[8]
    					? "mdc-text-field--outlined"
    					: "") + "\n      " + (/*variant*/ ctx[10] === "standard" && !/*fullwidth*/ ctx[8] && !/*textarea*/ ctx[9]
    					? "smui-text-field--standard"
    					: "") + "\n      " + (/*dense*/ ctx[11] ? "mdc-text-field--dense" : "") + "\n      " + (/*noLabel*/ ctx[14] ? "mdc-text-field--no-label" : "") + "\n      " + (/*withLeadingIcon*/ ctx[12]
    					? "mdc-text-field--with-leading-icon"
    					: "") + "\n      " + (/*withTrailingIcon*/ ctx[13]
    					? "mdc-text-field--with-trailing-icon"
    					: "") + "\n      " + (/*invalid*/ ctx[3] ? "mdc-text-field--invalid" : "") + "\n    "
    				},
    				dirty[0] & /*props*/ 524288 && /*props*/ ctx[19]
    			]));

    			if (useActions_action && is_function(useActions_action.update) && dirty[0] & /*use*/ 16) useActions_action.update.call(null, /*use*/ ctx[4]);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (default_slot) default_slot.d(detaching);
    			/*div_binding*/ ctx[43](null);
    			run_all(dispose);
    		}
    	};
    }

    // (1:0) {#if valued}
    function create_if_block$3(ctx) {
    	let label_1;
    	let t0;
    	let current_block_type_index;
    	let if_block0;
    	let t1;
    	let t2;
    	let useActions_action;
    	let forwardEvents_action;
    	let current;
    	let dispose;
    	const default_slot_template = /*$$slots*/ ctx[30].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[44], null);
    	const if_block_creators = [create_if_block_6, create_else_block$1];
    	const if_blocks = [];

    	function select_block_type_1(ctx, dirty) {
    		if (/*textarea*/ ctx[9]) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type_1(ctx);
    	if_block0 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    	let if_block1 = !/*textarea*/ ctx[9] && /*variant*/ ctx[10] !== "outlined" && create_if_block_3(ctx);
    	let if_block2 = (/*textarea*/ ctx[9] || /*variant*/ ctx[10] === "outlined" && !/*fullwidth*/ ctx[8]) && create_if_block_1$1(ctx);

    	let label_1_levels = [
    		{
    			class: "\n      mdc-text-field\n      " + /*className*/ ctx[5] + "\n      " + (/*disabled*/ ctx[7] ? "mdc-text-field--disabled" : "") + "\n      " + (/*fullwidth*/ ctx[8] ? "mdc-text-field--fullwidth" : "") + "\n      " + (/*textarea*/ ctx[9] ? "mdc-text-field--textarea" : "") + "\n      " + (/*variant*/ ctx[10] === "outlined" && !/*fullwidth*/ ctx[8]
    			? "mdc-text-field--outlined"
    			: "") + "\n      " + (/*variant*/ ctx[10] === "standard" && !/*fullwidth*/ ctx[8] && !/*textarea*/ ctx[9]
    			? "smui-text-field--standard"
    			: "") + "\n      " + (/*dense*/ ctx[11] ? "mdc-text-field--dense" : "") + "\n      " + (/*noLabel*/ ctx[14] || /*label*/ ctx[15] == null
    			? "mdc-text-field--no-label"
    			: "") + "\n      " + (/*withLeadingIcon*/ ctx[12]
    			? "mdc-text-field--with-leading-icon"
    			: "") + "\n      " + (/*withTrailingIcon*/ ctx[13]
    			? "mdc-text-field--with-trailing-icon"
    			: "") + "\n      " + (/*invalid*/ ctx[3] ? "mdc-text-field--invalid" : "") + "\n    "
    		},
    		/*props*/ ctx[19]
    	];

    	let label_1_data = {};

    	for (let i = 0; i < label_1_levels.length; i += 1) {
    		label_1_data = assign(label_1_data, label_1_levels[i]);
    	}

    	return {
    		c() {
    			label_1 = element("label");
    			if (default_slot) default_slot.c();
    			t0 = space();
    			if_block0.c();
    			t1 = space();
    			if (if_block1) if_block1.c();
    			t2 = space();
    			if (if_block2) if_block2.c();
    			set_attributes(label_1, label_1_data);
    		},
    		m(target, anchor) {
    			insert(target, label_1, anchor);

    			if (default_slot) {
    				default_slot.m(label_1, null);
    			}

    			append(label_1, t0);
    			if_blocks[current_block_type_index].m(label_1, null);
    			append(label_1, t1);
    			if (if_block1) if_block1.m(label_1, null);
    			append(label_1, t2);
    			if (if_block2) if_block2.m(label_1, null);
    			/*label_1_binding*/ ctx[42](label_1);
    			current = true;

    			dispose = [
    				action_destroyer(useActions_action = useActions.call(null, label_1, /*use*/ ctx[4])),
    				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[21].call(null, label_1))
    			];
    		},
    		p(ctx, dirty) {
    			if (default_slot && default_slot.p && dirty[1] & /*$$scope*/ 8192) {
    				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[44], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[44], dirty, null));
    			}

    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type_1(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block0 = if_blocks[current_block_type_index];

    				if (!if_block0) {
    					if_block0 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block0.c();
    				}

    				transition_in(if_block0, 1);
    				if_block0.m(label_1, t1);
    			}

    			if (!/*textarea*/ ctx[9] && /*variant*/ ctx[10] !== "outlined") {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    					transition_in(if_block1, 1);
    				} else {
    					if_block1 = create_if_block_3(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(label_1, t2);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (/*textarea*/ ctx[9] || /*variant*/ ctx[10] === "outlined" && !/*fullwidth*/ ctx[8]) {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);
    					transition_in(if_block2, 1);
    				} else {
    					if_block2 = create_if_block_1$1(ctx);
    					if_block2.c();
    					transition_in(if_block2, 1);
    					if_block2.m(label_1, null);
    				}
    			} else if (if_block2) {
    				group_outros();

    				transition_out(if_block2, 1, 1, () => {
    					if_block2 = null;
    				});

    				check_outros();
    			}

    			set_attributes(label_1, get_spread_update(label_1_levels, [
    				dirty[0] & /*className, disabled, fullwidth, textarea, variant, dense, noLabel, label, withLeadingIcon, withTrailingIcon, invalid*/ 65448 && {
    					class: "\n      mdc-text-field\n      " + /*className*/ ctx[5] + "\n      " + (/*disabled*/ ctx[7] ? "mdc-text-field--disabled" : "") + "\n      " + (/*fullwidth*/ ctx[8] ? "mdc-text-field--fullwidth" : "") + "\n      " + (/*textarea*/ ctx[9] ? "mdc-text-field--textarea" : "") + "\n      " + (/*variant*/ ctx[10] === "outlined" && !/*fullwidth*/ ctx[8]
    					? "mdc-text-field--outlined"
    					: "") + "\n      " + (/*variant*/ ctx[10] === "standard" && !/*fullwidth*/ ctx[8] && !/*textarea*/ ctx[9]
    					? "smui-text-field--standard"
    					: "") + "\n      " + (/*dense*/ ctx[11] ? "mdc-text-field--dense" : "") + "\n      " + (/*noLabel*/ ctx[14] || /*label*/ ctx[15] == null
    					? "mdc-text-field--no-label"
    					: "") + "\n      " + (/*withLeadingIcon*/ ctx[12]
    					? "mdc-text-field--with-leading-icon"
    					: "") + "\n      " + (/*withTrailingIcon*/ ctx[13]
    					? "mdc-text-field--with-trailing-icon"
    					: "") + "\n      " + (/*invalid*/ ctx[3] ? "mdc-text-field--invalid" : "") + "\n    "
    				},
    				dirty[0] & /*props*/ 524288 && /*props*/ ctx[19]
    			]));

    			if (useActions_action && is_function(useActions_action.update) && dirty[0] & /*use*/ 16) useActions_action.update.call(null, /*use*/ ctx[4]);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			transition_in(if_block0);
    			transition_in(if_block1);
    			transition_in(if_block2);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			transition_out(if_block0);
    			transition_out(if_block1);
    			transition_out(if_block2);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(label_1);
    			if (default_slot) default_slot.d(detaching);
    			if_blocks[current_block_type_index].d();
    			if (if_block1) if_block1.d();
    			if (if_block2) if_block2.d();
    			/*label_1_binding*/ ctx[42](null);
    			run_all(dispose);
    		}
    	};
    }

    // (34:4) {:else}
    function create_else_block$1(ctx) {
    	let updating_value;
    	let updating_files;
    	let updating_dirty;
    	let updating_invalid;
    	let current;

    	const input_spread_levels = [
    		{ type: /*type*/ ctx[16] },
    		{ disabled: /*disabled*/ ctx[7] },
    		{ updateInvalid: /*updateInvalid*/ ctx[17] },
    		/*fullwidth*/ ctx[8] && /*label*/ ctx[15]
    		? { placeholder: /*label*/ ctx[15] }
    		: {},
    		prefixFilter(/*$$props*/ ctx[22], "input$")
    	];

    	function input_value_binding(value) {
    		/*input_value_binding*/ ctx[36].call(null, value);
    	}

    	function input_files_binding(value) {
    		/*input_files_binding*/ ctx[37].call(null, value);
    	}

    	function input_dirty_binding(value) {
    		/*input_dirty_binding*/ ctx[38].call(null, value);
    	}

    	function input_invalid_binding(value) {
    		/*input_invalid_binding*/ ctx[39].call(null, value);
    	}

    	let input_props = {};

    	for (let i = 0; i < input_spread_levels.length; i += 1) {
    		input_props = assign(input_props, input_spread_levels[i]);
    	}

    	if (/*value*/ ctx[0] !== void 0) {
    		input_props.value = /*value*/ ctx[0];
    	}

    	if (/*files*/ ctx[1] !== void 0) {
    		input_props.files = /*files*/ ctx[1];
    	}

    	if (/*dirty*/ ctx[2] !== void 0) {
    		input_props.dirty = /*dirty*/ ctx[2];
    	}

    	if (/*invalid*/ ctx[3] !== void 0) {
    		input_props.invalid = /*invalid*/ ctx[3];
    	}

    	const input = new Input({ props: input_props });
    	binding_callbacks.push(() => bind(input, "value", input_value_binding));
    	binding_callbacks.push(() => bind(input, "files", input_files_binding));
    	binding_callbacks.push(() => bind(input, "dirty", input_dirty_binding));
    	binding_callbacks.push(() => bind(input, "invalid", input_invalid_binding));
    	input.$on("change", /*change_handler_1*/ ctx[40]);
    	input.$on("input", /*input_handler_1*/ ctx[41]);

    	return {
    		c() {
    			create_component(input.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(input, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const input_changes = (dirty[0] & /*type, disabled, updateInvalid, fullwidth, label, $$props*/ 4424064)
    			? get_spread_update(input_spread_levels, [
    					dirty[0] & /*type*/ 65536 && { type: /*type*/ ctx[16] },
    					dirty[0] & /*disabled*/ 128 && { disabled: /*disabled*/ ctx[7] },
    					dirty[0] & /*updateInvalid*/ 131072 && { updateInvalid: /*updateInvalid*/ ctx[17] },
    					dirty[0] & /*fullwidth, label*/ 33024 && get_spread_object(/*fullwidth*/ ctx[8] && /*label*/ ctx[15]
    					? { placeholder: /*label*/ ctx[15] }
    					: {}),
    					dirty[0] & /*$$props*/ 4194304 && get_spread_object(prefixFilter(/*$$props*/ ctx[22], "input$"))
    				])
    			: {};

    			if (!updating_value && dirty[0] & /*value*/ 1) {
    				updating_value = true;
    				input_changes.value = /*value*/ ctx[0];
    				add_flush_callback(() => updating_value = false);
    			}

    			if (!updating_files && dirty[0] & /*files*/ 2) {
    				updating_files = true;
    				input_changes.files = /*files*/ ctx[1];
    				add_flush_callback(() => updating_files = false);
    			}

    			if (!updating_dirty && dirty[0] & /*dirty*/ 4) {
    				updating_dirty = true;
    				input_changes.dirty = /*dirty*/ ctx[2];
    				add_flush_callback(() => updating_dirty = false);
    			}

    			if (!updating_invalid && dirty[0] & /*invalid*/ 8) {
    				updating_invalid = true;
    				input_changes.invalid = /*invalid*/ ctx[3];
    				add_flush_callback(() => updating_invalid = false);
    			}

    			input.$set(input_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(input.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(input.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(input, detaching);
    		}
    	};
    }

    // (23:4) {#if textarea}
    function create_if_block_6(ctx) {
    	let updating_value;
    	let updating_dirty;
    	let updating_invalid;
    	let current;

    	const textarea_1_spread_levels = [
    		{ disabled: /*disabled*/ ctx[7] },
    		{ updateInvalid: /*updateInvalid*/ ctx[17] },
    		prefixFilter(/*$$props*/ ctx[22], "input$")
    	];

    	function textarea_1_value_binding(value) {
    		/*textarea_1_value_binding*/ ctx[31].call(null, value);
    	}

    	function textarea_1_dirty_binding(value) {
    		/*textarea_1_dirty_binding*/ ctx[32].call(null, value);
    	}

    	function textarea_1_invalid_binding(value) {
    		/*textarea_1_invalid_binding*/ ctx[33].call(null, value);
    	}

    	let textarea_1_props = {};

    	for (let i = 0; i < textarea_1_spread_levels.length; i += 1) {
    		textarea_1_props = assign(textarea_1_props, textarea_1_spread_levels[i]);
    	}

    	if (/*value*/ ctx[0] !== void 0) {
    		textarea_1_props.value = /*value*/ ctx[0];
    	}

    	if (/*dirty*/ ctx[2] !== void 0) {
    		textarea_1_props.dirty = /*dirty*/ ctx[2];
    	}

    	if (/*invalid*/ ctx[3] !== void 0) {
    		textarea_1_props.invalid = /*invalid*/ ctx[3];
    	}

    	const textarea_1 = new Textarea({ props: textarea_1_props });
    	binding_callbacks.push(() => bind(textarea_1, "value", textarea_1_value_binding));
    	binding_callbacks.push(() => bind(textarea_1, "dirty", textarea_1_dirty_binding));
    	binding_callbacks.push(() => bind(textarea_1, "invalid", textarea_1_invalid_binding));
    	textarea_1.$on("change", /*change_handler*/ ctx[34]);
    	textarea_1.$on("input", /*input_handler*/ ctx[35]);

    	return {
    		c() {
    			create_component(textarea_1.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(textarea_1, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const textarea_1_changes = (dirty[0] & /*disabled, updateInvalid, $$props*/ 4325504)
    			? get_spread_update(textarea_1_spread_levels, [
    					dirty[0] & /*disabled*/ 128 && { disabled: /*disabled*/ ctx[7] },
    					dirty[0] & /*updateInvalid*/ 131072 && { updateInvalid: /*updateInvalid*/ ctx[17] },
    					dirty[0] & /*$$props*/ 4194304 && get_spread_object(prefixFilter(/*$$props*/ ctx[22], "input$"))
    				])
    			: {};

    			if (!updating_value && dirty[0] & /*value*/ 1) {
    				updating_value = true;
    				textarea_1_changes.value = /*value*/ ctx[0];
    				add_flush_callback(() => updating_value = false);
    			}

    			if (!updating_dirty && dirty[0] & /*dirty*/ 4) {
    				updating_dirty = true;
    				textarea_1_changes.dirty = /*dirty*/ ctx[2];
    				add_flush_callback(() => updating_dirty = false);
    			}

    			if (!updating_invalid && dirty[0] & /*invalid*/ 8) {
    				updating_invalid = true;
    				textarea_1_changes.invalid = /*invalid*/ ctx[3];
    				add_flush_callback(() => updating_invalid = false);
    			}

    			textarea_1.$set(textarea_1_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(textarea_1.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(textarea_1.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(textarea_1, detaching);
    		}
    	};
    }

    // (49:4) {#if !textarea && variant !== 'outlined'}
    function create_if_block_3(ctx) {
    	let t;
    	let if_block1_anchor;
    	let current;
    	let if_block0 = !/*noLabel*/ ctx[14] && /*label*/ ctx[15] != null && !/*fullwidth*/ ctx[8] && create_if_block_5(ctx);
    	let if_block1 = /*ripple*/ ctx[6] && create_if_block_4(ctx);

    	return {
    		c() {
    			if (if_block0) if_block0.c();
    			t = space();
    			if (if_block1) if_block1.c();
    			if_block1_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block0) if_block0.m(target, anchor);
    			insert(target, t, anchor);
    			if (if_block1) if_block1.m(target, anchor);
    			insert(target, if_block1_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (!/*noLabel*/ ctx[14] && /*label*/ ctx[15] != null && !/*fullwidth*/ ctx[8]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    					transition_in(if_block0, 1);
    				} else {
    					if_block0 = create_if_block_5(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(t.parentNode, t);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (/*ripple*/ ctx[6]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    					transition_in(if_block1, 1);
    				} else {
    					if_block1 = create_if_block_4(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(if_block1_anchor.parentNode, if_block1_anchor);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(if_block1);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block0);
    			transition_out(if_block1);
    			current = false;
    		},
    		d(detaching) {
    			if (if_block0) if_block0.d(detaching);
    			if (detaching) detach(t);
    			if (if_block1) if_block1.d(detaching);
    			if (detaching) detach(if_block1_anchor);
    		}
    	};
    }

    // (50:6) {#if !noLabel && label != null && !fullwidth}
    function create_if_block_5(ctx) {
    	let current;
    	const floatinglabel_spread_levels = [{ wrapped: true }, prefixFilter(/*$$props*/ ctx[22], "label$")];

    	let floatinglabel_props = {
    		$$slots: { default: [create_default_slot_2] },
    		$$scope: { ctx }
    	};

    	for (let i = 0; i < floatinglabel_spread_levels.length; i += 1) {
    		floatinglabel_props = assign(floatinglabel_props, floatinglabel_spread_levels[i]);
    	}

    	const floatinglabel = new FloatingLabel({ props: floatinglabel_props });

    	return {
    		c() {
    			create_component(floatinglabel.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(floatinglabel, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const floatinglabel_changes = (dirty[0] & /*$$props*/ 4194304)
    			? get_spread_update(floatinglabel_spread_levels, [
    					floatinglabel_spread_levels[0],
    					get_spread_object(prefixFilter(/*$$props*/ ctx[22], "label$"))
    				])
    			: {};

    			if (dirty[0] & /*label*/ 32768 | dirty[1] & /*$$scope*/ 8192) {
    				floatinglabel_changes.$$scope = { dirty, ctx };
    			}

    			floatinglabel.$set(floatinglabel_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(floatinglabel.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(floatinglabel.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(floatinglabel, detaching);
    		}
    	};
    }

    // (51:8) <FloatingLabel wrapped {...prefixFilter($$props, 'label$')}>
    function create_default_slot_2(ctx) {
    	let t;
    	let current;
    	const label_slot_template = /*$$slots*/ ctx[30].label;
    	const label_slot = create_slot(label_slot_template, ctx, /*$$scope*/ ctx[44], get_label_slot_context);

    	return {
    		c() {
    			t = text(/*label*/ ctx[15]);
    			if (label_slot) label_slot.c();
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);

    			if (label_slot) {
    				label_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (!current || dirty[0] & /*label*/ 32768) set_data(t, /*label*/ ctx[15]);

    			if (label_slot && label_slot.p && dirty[1] & /*$$scope*/ 8192) {
    				label_slot.p(get_slot_context(label_slot_template, ctx, /*$$scope*/ ctx[44], get_label_slot_context), get_slot_changes(label_slot_template, /*$$scope*/ ctx[44], dirty, get_label_slot_changes));
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(label_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(label_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    			if (label_slot) label_slot.d(detaching);
    		}
    	};
    }

    // (53:6) {#if ripple}
    function create_if_block_4(ctx) {
    	let current;
    	const lineripple_spread_levels = [prefixFilter(/*$$props*/ ctx[22], "ripple$")];
    	let lineripple_props = {};

    	for (let i = 0; i < lineripple_spread_levels.length; i += 1) {
    		lineripple_props = assign(lineripple_props, lineripple_spread_levels[i]);
    	}

    	const lineripple = new LineRipple({ props: lineripple_props });

    	return {
    		c() {
    			create_component(lineripple.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(lineripple, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const lineripple_changes = (dirty[0] & /*$$props*/ 4194304)
    			? get_spread_update(lineripple_spread_levels, [get_spread_object(prefixFilter(/*$$props*/ ctx[22], "ripple$"))])
    			: {};

    			lineripple.$set(lineripple_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(lineripple.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(lineripple.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(lineripple, detaching);
    		}
    	};
    }

    // (57:4) {#if textarea || (variant === 'outlined' && !fullwidth)}
    function create_if_block_1$1(ctx) {
    	let current;

    	const notchedoutline_spread_levels = [
    		{
    			noLabel: /*noLabel*/ ctx[14] || /*label*/ ctx[15] == null
    		},
    		prefixFilter(/*$$props*/ ctx[22], "outline$")
    	];

    	let notchedoutline_props = {
    		$$slots: { default: [create_default_slot] },
    		$$scope: { ctx }
    	};

    	for (let i = 0; i < notchedoutline_spread_levels.length; i += 1) {
    		notchedoutline_props = assign(notchedoutline_props, notchedoutline_spread_levels[i]);
    	}

    	const notchedoutline = new NotchedOutline({ props: notchedoutline_props });

    	return {
    		c() {
    			create_component(notchedoutline.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(notchedoutline, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const notchedoutline_changes = (dirty[0] & /*noLabel, label, $$props*/ 4243456)
    			? get_spread_update(notchedoutline_spread_levels, [
    					dirty[0] & /*noLabel, label*/ 49152 && {
    						noLabel: /*noLabel*/ ctx[14] || /*label*/ ctx[15] == null
    					},
    					dirty[0] & /*$$props*/ 4194304 && get_spread_object(prefixFilter(/*$$props*/ ctx[22], "outline$"))
    				])
    			: {};

    			if (dirty[0] & /*label, noLabel*/ 49152 | dirty[1] & /*$$scope*/ 8192) {
    				notchedoutline_changes.$$scope = { dirty, ctx };
    			}

    			notchedoutline.$set(notchedoutline_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(notchedoutline.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(notchedoutline.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(notchedoutline, detaching);
    		}
    	};
    }

    // (59:8) {#if !noLabel && label != null}
    function create_if_block_2(ctx) {
    	let current;
    	const floatinglabel_spread_levels = [{ wrapped: true }, prefixFilter(/*$$props*/ ctx[22], "label$")];

    	let floatinglabel_props = {
    		$$slots: { default: [create_default_slot_1] },
    		$$scope: { ctx }
    	};

    	for (let i = 0; i < floatinglabel_spread_levels.length; i += 1) {
    		floatinglabel_props = assign(floatinglabel_props, floatinglabel_spread_levels[i]);
    	}

    	const floatinglabel = new FloatingLabel({ props: floatinglabel_props });

    	return {
    		c() {
    			create_component(floatinglabel.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(floatinglabel, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const floatinglabel_changes = (dirty[0] & /*$$props*/ 4194304)
    			? get_spread_update(floatinglabel_spread_levels, [
    					floatinglabel_spread_levels[0],
    					get_spread_object(prefixFilter(/*$$props*/ ctx[22], "label$"))
    				])
    			: {};

    			if (dirty[0] & /*label*/ 32768 | dirty[1] & /*$$scope*/ 8192) {
    				floatinglabel_changes.$$scope = { dirty, ctx };
    			}

    			floatinglabel.$set(floatinglabel_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(floatinglabel.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(floatinglabel.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(floatinglabel, detaching);
    		}
    	};
    }

    // (60:10) <FloatingLabel wrapped {...prefixFilter($$props, 'label$')}>
    function create_default_slot_1(ctx) {
    	let t;
    	let current;
    	const label_slot_template = /*$$slots*/ ctx[30].label;
    	const label_slot = create_slot(label_slot_template, ctx, /*$$scope*/ ctx[44], get_label_slot_context_1);

    	return {
    		c() {
    			t = text(/*label*/ ctx[15]);
    			if (label_slot) label_slot.c();
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);

    			if (label_slot) {
    				label_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (!current || dirty[0] & /*label*/ 32768) set_data(t, /*label*/ ctx[15]);

    			if (label_slot && label_slot.p && dirty[1] & /*$$scope*/ 8192) {
    				label_slot.p(get_slot_context(label_slot_template, ctx, /*$$scope*/ ctx[44], get_label_slot_context_1), get_slot_changes(label_slot_template, /*$$scope*/ ctx[44], dirty, get_label_slot_changes_1));
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(label_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(label_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    			if (label_slot) label_slot.d(detaching);
    		}
    	};
    }

    // (58:6) <NotchedOutline noLabel={noLabel || label == null} {...prefixFilter($$props, 'outline$')}>
    function create_default_slot(ctx) {
    	let if_block_anchor;
    	let current;
    	let if_block = !/*noLabel*/ ctx[14] && /*label*/ ctx[15] != null && create_if_block_2(ctx);

    	return {
    		c() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (!/*noLabel*/ ctx[14] && /*label*/ ctx[15] != null) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    					transition_in(if_block, 1);
    				} else {
    					if_block = create_if_block_2(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function create_fragment$7(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block$3, create_else_block_1];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*valued*/ ctx[20]) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	return {
    		c() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in(if_block, 1);
    				if_block.m(if_block_anchor.parentNode, if_block_anchor);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function instance$7($$self, $$props, $$invalidate) {
    	const forwardEvents = forwardEventsBuilder(current_component);

    	let uninitializedValue = () => {
    		
    	};

    	let { use = [] } = $$props;
    	let { class: className = "" } = $$props;
    	let { ripple = true } = $$props;
    	let { disabled = false } = $$props;
    	let { fullwidth = false } = $$props;
    	let { textarea = false } = $$props;
    	let { variant = "standard" } = $$props;
    	let { dense = false } = $$props;
    	let { withLeadingIcon = false } = $$props;
    	let { withTrailingIcon = false } = $$props;
    	let { noLabel = false } = $$props;
    	let { label = null } = $$props;
    	let { type = "text" } = $$props;
    	let { value = uninitializedValue } = $$props;
    	let { files = uninitializedValue } = $$props;
    	let { dirty = false } = $$props;
    	let { invalid = uninitializedValue } = $$props;
    	let { updateInvalid = invalid === uninitializedValue } = $$props;
    	let { useNativeValidation = updateInvalid } = $$props;
    	let element;
    	let textField;
    	let addLayoutListener = getContext("SMUI:addLayoutListener");
    	let removeLayoutListener;

    	if (addLayoutListener) {
    		removeLayoutListener = addLayoutListener(layout);
    	}

    	onMount(() => {
    		$$invalidate(26, textField = new MDCTextField(element));

    		if (!ripple) {
    			textField.ripple && textField.ripple.destroy();
    		}
    	});

    	onDestroy(() => {
    		textField && textField.destroy();

    		if (removeLayoutListener) {
    			removeLayoutListener();
    		}
    	});

    	function focus(...args) {
    		return textField.focus(...args);
    	}

    	function layout(...args) {
    		return textField.layout(...args);
    	}

    	let { $$slots = {}, $$scope } = $$props;

    	function textarea_1_value_binding(value$1) {
    		value = value$1;
    		$$invalidate(0, value);
    	}

    	function textarea_1_dirty_binding(value) {
    		dirty = value;
    		$$invalidate(2, dirty);
    	}

    	function textarea_1_invalid_binding(value$1) {
    		invalid = value$1;
    		(((((($$invalidate(3, invalid), $$invalidate(26, textField)), $$invalidate(17, updateInvalid)), $$invalidate(0, value)), $$invalidate(28, uninitializedValue)), $$invalidate(7, disabled)), $$invalidate(23, useNativeValidation));
    	}

    	function change_handler(event) {
    		bubble($$self, event);
    	}

    	function input_handler(event) {
    		bubble($$self, event);
    	}

    	function input_value_binding(value$1) {
    		value = value$1;
    		$$invalidate(0, value);
    	}

    	function input_files_binding(value) {
    		files = value;
    		$$invalidate(1, files);
    	}

    	function input_dirty_binding(value) {
    		dirty = value;
    		$$invalidate(2, dirty);
    	}

    	function input_invalid_binding(value$1) {
    		invalid = value$1;
    		(((((($$invalidate(3, invalid), $$invalidate(26, textField)), $$invalidate(17, updateInvalid)), $$invalidate(0, value)), $$invalidate(28, uninitializedValue)), $$invalidate(7, disabled)), $$invalidate(23, useNativeValidation));
    	}

    	function change_handler_1(event) {
    		bubble($$self, event);
    	}

    	function input_handler_1(event) {
    		bubble($$self, event);
    	}

    	function label_1_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(18, element = $$value);
    		});
    	}

    	function div_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(18, element = $$value);
    		});
    	}

    	$$self.$set = $$new_props => {
    		$$invalidate(22, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		if ("use" in $$new_props) $$invalidate(4, use = $$new_props.use);
    		if ("class" in $$new_props) $$invalidate(5, className = $$new_props.class);
    		if ("ripple" in $$new_props) $$invalidate(6, ripple = $$new_props.ripple);
    		if ("disabled" in $$new_props) $$invalidate(7, disabled = $$new_props.disabled);
    		if ("fullwidth" in $$new_props) $$invalidate(8, fullwidth = $$new_props.fullwidth);
    		if ("textarea" in $$new_props) $$invalidate(9, textarea = $$new_props.textarea);
    		if ("variant" in $$new_props) $$invalidate(10, variant = $$new_props.variant);
    		if ("dense" in $$new_props) $$invalidate(11, dense = $$new_props.dense);
    		if ("withLeadingIcon" in $$new_props) $$invalidate(12, withLeadingIcon = $$new_props.withLeadingIcon);
    		if ("withTrailingIcon" in $$new_props) $$invalidate(13, withTrailingIcon = $$new_props.withTrailingIcon);
    		if ("noLabel" in $$new_props) $$invalidate(14, noLabel = $$new_props.noLabel);
    		if ("label" in $$new_props) $$invalidate(15, label = $$new_props.label);
    		if ("type" in $$new_props) $$invalidate(16, type = $$new_props.type);
    		if ("value" in $$new_props) $$invalidate(0, value = $$new_props.value);
    		if ("files" in $$new_props) $$invalidate(1, files = $$new_props.files);
    		if ("dirty" in $$new_props) $$invalidate(2, dirty = $$new_props.dirty);
    		if ("invalid" in $$new_props) $$invalidate(3, invalid = $$new_props.invalid);
    		if ("updateInvalid" in $$new_props) $$invalidate(17, updateInvalid = $$new_props.updateInvalid);
    		if ("useNativeValidation" in $$new_props) $$invalidate(23, useNativeValidation = $$new_props.useNativeValidation);
    		if ("$$scope" in $$new_props) $$invalidate(44, $$scope = $$new_props.$$scope);
    	};

    	let props;
    	let valued;

    	$$self.$$.update = () => {
    		 $$invalidate(19, props = exclude($$props, [
    			"use",
    			"class",
    			"ripple",
    			"disabled",
    			"fullwidth",
    			"textarea",
    			"variant",
    			"dense",
    			"withLeadingIcon",
    			"withTrailingIcon",
    			"noLabel",
    			"label",
    			"type",
    			"value",
    			"dirty",
    			"invalid",
    			"updateInvalid",
    			"useNativeValidation",
    			"input$",
    			"label$",
    			"ripple$",
    			"outline$"
    		]));

    		if ($$self.$$.dirty[0] & /*value, files*/ 3) {
    			 $$invalidate(20, valued = value !== uninitializedValue || files !== uninitializedValue);
    		}

    		if ($$self.$$.dirty[0] & /*textField, value*/ 67108865) {
    			 if (textField && value !== uninitializedValue && textField.value !== value) {
    				$$invalidate(26, textField.value = value, textField);
    			}
    		}

    		if ($$self.$$.dirty[0] & /*textField, disabled*/ 67108992) {
    			 if (textField && textField.disabled !== disabled) {
    				$$invalidate(26, textField.disabled = disabled, textField);
    			}
    		}

    		if ($$self.$$.dirty[0] & /*textField, invalid, updateInvalid*/ 67239944) {
    			 if (textField && textField.valid !== !invalid) {
    				if (updateInvalid) {
    					$$invalidate(3, invalid = !textField.valid);
    				} else {
    					$$invalidate(26, textField.valid = !invalid, textField);
    				}
    			}
    		}

    		if ($$self.$$.dirty[0] & /*textField, useNativeValidation*/ 75497472) {
    			 if (textField && textField.useNativeValidation !== useNativeValidation) {
    				$$invalidate(26, textField.useNativeValidation = useNativeValidation, textField);
    			}
    		}
    	};

    	$$props = exclude_internal_props($$props);

    	return [
    		value,
    		files,
    		dirty,
    		invalid,
    		use,
    		className,
    		ripple,
    		disabled,
    		fullwidth,
    		textarea,
    		variant,
    		dense,
    		withLeadingIcon,
    		withTrailingIcon,
    		noLabel,
    		label,
    		type,
    		updateInvalid,
    		element,
    		props,
    		valued,
    		forwardEvents,
    		$$props,
    		useNativeValidation,
    		focus,
    		layout,
    		textField,
    		removeLayoutListener,
    		uninitializedValue,
    		addLayoutListener,
    		$$slots,
    		textarea_1_value_binding,
    		textarea_1_dirty_binding,
    		textarea_1_invalid_binding,
    		change_handler,
    		input_handler,
    		input_value_binding,
    		input_files_binding,
    		input_dirty_binding,
    		input_invalid_binding,
    		change_handler_1,
    		input_handler_1,
    		label_1_binding,
    		div_binding,
    		$$scope
    	];
    }

    class Textfield extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(
    			this,
    			options,
    			instance$7,
    			create_fragment$7,
    			safe_not_equal,
    			{
    				use: 4,
    				class: 5,
    				ripple: 6,
    				disabled: 7,
    				fullwidth: 8,
    				textarea: 9,
    				variant: 10,
    				dense: 11,
    				withLeadingIcon: 12,
    				withTrailingIcon: 13,
    				noLabel: 14,
    				label: 15,
    				type: 16,
    				value: 0,
    				files: 1,
    				dirty: 2,
    				invalid: 3,
    				updateInvalid: 17,
    				useNativeValidation: 23,
    				focus: 24,
    				layout: 25
    			},
    			[-1, -1]
    		);
    	}

    	get focus() {
    		return this.$$.ctx[24];
    	}

    	get layout() {
    		return this.$$.ctx[25];
    	}
    }

    /* node_modules/@smui/common/A.svelte generated by Svelte v3.19.1 */

    function create_fragment$8(ctx) {
    	let a;
    	let useActions_action;
    	let forwardEvents_action;
    	let current;
    	let dispose;
    	const default_slot_template = /*$$slots*/ ctx[5].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[4], null);
    	let a_levels = [{ href: /*href*/ ctx[1] }, exclude(/*$$props*/ ctx[3], ["use", "href"])];
    	let a_data = {};

    	for (let i = 0; i < a_levels.length; i += 1) {
    		a_data = assign(a_data, a_levels[i]);
    	}

    	return {
    		c() {
    			a = element("a");
    			if (default_slot) default_slot.c();
    			set_attributes(a, a_data);
    		},
    		m(target, anchor) {
    			insert(target, a, anchor);

    			if (default_slot) {
    				default_slot.m(a, null);
    			}

    			current = true;

    			dispose = [
    				action_destroyer(useActions_action = useActions.call(null, a, /*use*/ ctx[0])),
    				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[2].call(null, a))
    			];
    		},
    		p(ctx, [dirty]) {
    			if (default_slot && default_slot.p && dirty & /*$$scope*/ 16) {
    				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[4], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[4], dirty, null));
    			}

    			set_attributes(a, get_spread_update(a_levels, [
    				dirty & /*href*/ 2 && { href: /*href*/ ctx[1] },
    				dirty & /*exclude, $$props*/ 8 && exclude(/*$$props*/ ctx[3], ["use", "href"])
    			]));

    			if (useActions_action && is_function(useActions_action.update) && dirty & /*use*/ 1) useActions_action.update.call(null, /*use*/ ctx[0]);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(a);
    			if (default_slot) default_slot.d(detaching);
    			run_all(dispose);
    		}
    	};
    }

    function instance$8($$self, $$props, $$invalidate) {
    	const forwardEvents = forwardEventsBuilder(current_component);
    	let { use = [] } = $$props;
    	let { href = "javascript:void(0);" } = $$props;
    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$set = $$new_props => {
    		$$invalidate(3, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		if ("use" in $$new_props) $$invalidate(0, use = $$new_props.use);
    		if ("href" in $$new_props) $$invalidate(1, href = $$new_props.href);
    		if ("$$scope" in $$new_props) $$invalidate(4, $$scope = $$new_props.$$scope);
    	};

    	$$props = exclude_internal_props($$props);
    	return [use, href, forwardEvents, $$props, $$scope, $$slots];
    }

    class A extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$8, create_fragment$8, safe_not_equal, { use: 0, href: 1 });
    	}
    }

    /* node_modules/@smui/common/Button.svelte generated by Svelte v3.19.1 */

    function create_fragment$9(ctx) {
    	let button;
    	let useActions_action;
    	let forwardEvents_action;
    	let current;
    	let dispose;
    	const default_slot_template = /*$$slots*/ ctx[4].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[3], null);
    	let button_levels = [exclude(/*$$props*/ ctx[2], ["use"])];
    	let button_data = {};

    	for (let i = 0; i < button_levels.length; i += 1) {
    		button_data = assign(button_data, button_levels[i]);
    	}

    	return {
    		c() {
    			button = element("button");
    			if (default_slot) default_slot.c();
    			set_attributes(button, button_data);
    		},
    		m(target, anchor) {
    			insert(target, button, anchor);

    			if (default_slot) {
    				default_slot.m(button, null);
    			}

    			current = true;

    			dispose = [
    				action_destroyer(useActions_action = useActions.call(null, button, /*use*/ ctx[0])),
    				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[1].call(null, button))
    			];
    		},
    		p(ctx, [dirty]) {
    			if (default_slot && default_slot.p && dirty & /*$$scope*/ 8) {
    				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[3], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[3], dirty, null));
    			}

    			set_attributes(button, get_spread_update(button_levels, [dirty & /*exclude, $$props*/ 4 && exclude(/*$$props*/ ctx[2], ["use"])]));
    			if (useActions_action && is_function(useActions_action.update) && dirty & /*use*/ 1) useActions_action.update.call(null, /*use*/ ctx[0]);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(button);
    			if (default_slot) default_slot.d(detaching);
    			run_all(dispose);
    		}
    	};
    }

    function instance$9($$self, $$props, $$invalidate) {
    	const forwardEvents = forwardEventsBuilder(current_component);
    	let { use = [] } = $$props;
    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$set = $$new_props => {
    		$$invalidate(2, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		if ("use" in $$new_props) $$invalidate(0, use = $$new_props.use);
    		if ("$$scope" in $$new_props) $$invalidate(3, $$scope = $$new_props.$$scope);
    	};

    	$$props = exclude_internal_props($$props);
    	return [use, forwardEvents, $$props, $$scope, $$slots];
    }

    class Button extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$9, create_fragment$9, safe_not_equal, { use: 0 });
    	}
    }

    function Ripple(node, props = {ripple: false, unbounded: false, color: null, classForward: () => {}}) {
      let instance = null;
      let addLayoutListener = getContext('SMUI:addLayoutListener');
      let removeLayoutListener;
      let classList = [];

      function addClass(className) {
        const idx = classList.indexOf(className);
        if (idx === -1) {
          node.classList.add(className);
          classList.push(className);
          if (props.classForward) {
            props.classForward(classList);
            console.log('addClass', className, classList);
          }
        }
      }

      function removeClass(className) {
        const idx = classList.indexOf(className);
        if (idx !== -1) {
          node.classList.remove(className);
          classList.splice(idx, 1);
          if (props.classForward) {
            props.classForward(classList);
            console.log('removeClass', className, classList);
          }
        }
      }

      function handleProps() {
        if (props.ripple && !instance) {
          // Override the Ripple component's adapter, so that we can forward classes
          // to Svelte components that overwrite Ripple's classes.
          const _createAdapter = MDCRipple.createAdapter;
          MDCRipple.createAdapter = function(...args) {
            const adapter = _createAdapter.apply(this, args);
            adapter.addClass = function(className) {
              return addClass(className);
            };
            adapter.removeClass = function(className) {
              return removeClass(className);
            };
            return adapter;
          };
          instance = new MDCRipple(node);
          MDCRipple.createAdapter = _createAdapter;
        } else if (instance && !props.ripple) {
          instance.destroy();
          instance = null;
        }
        if (props.ripple) {
          instance.unbounded = !!props.unbounded;
          switch (props.color) {
            case 'surface':
              addClass('mdc-ripple-surface');
              removeClass('mdc-ripple-surface--primary');
              removeClass('mdc-ripple-surface--accent');
              return;
            case 'primary':
              addClass('mdc-ripple-surface');
              addClass('mdc-ripple-surface--primary');
              removeClass('mdc-ripple-surface--accent');
              return;
            case 'secondary':
              addClass('mdc-ripple-surface');
              removeClass('mdc-ripple-surface--primary');
              addClass('mdc-ripple-surface--accent');
              return;
          }
        }
        removeClass('mdc-ripple-surface');
        removeClass('mdc-ripple-surface--primary');
        removeClass('mdc-ripple-surface--accent');
      }

      handleProps();

      if (addLayoutListener) {
        removeLayoutListener = addLayoutListener(layout);
      }

      function layout() {
        if (instance) {
          instance.layout();
        }
      }

      return {
        update(newProps = {ripple: false, unbounded: false, color: null, classForward: []}) {
          props = newProps;
          handleProps();
        },

        destroy() {
          if (instance) {
            instance.destroy();
            instance = null;
            removeClass('mdc-ripple-surface');
            removeClass('mdc-ripple-surface--primary');
            removeClass('mdc-ripple-surface--accent');
          }

          if (removeLayoutListener) {
            removeLayoutListener();
          }
        }
      }
    }

    /* node_modules/@smui/button/Button.svelte generated by Svelte v3.19.1 */

    function create_default_slot$1(ctx) {
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[17].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[19], null);

    	return {
    		c() {
    			if (default_slot) default_slot.c();
    		},
    		m(target, anchor) {
    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (default_slot && default_slot.p && dirty & /*$$scope*/ 524288) {
    				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[19], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[19], dirty, null));
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function create_fragment$a(ctx) {
    	let switch_instance_anchor;
    	let current;

    	const switch_instance_spread_levels = [
    		{
    			use: [
    				[
    					Ripple,
    					{
    						ripple: /*ripple*/ ctx[2],
    						unbounded: false,
    						classForward: /*func*/ ctx[18]
    					}
    				],
    				/*forwardEvents*/ ctx[11],
    				.../*use*/ ctx[0]
    			]
    		},
    		{
    			class: "\n    mdc-button\n    " + /*className*/ ctx[1] + "\n    " + /*rippleClasses*/ ctx[7].join(" ") + "\n    " + (/*variant*/ ctx[4] === "raised"
    			? "mdc-button--raised"
    			: "") + "\n    " + (/*variant*/ ctx[4] === "unelevated"
    			? "mdc-button--unelevated"
    			: "") + "\n    " + (/*variant*/ ctx[4] === "outlined"
    			? "mdc-button--outlined"
    			: "") + "\n    " + (/*dense*/ ctx[5] ? "mdc-button--dense" : "") + "\n    " + (/*color*/ ctx[3] === "secondary"
    			? "smui-button--color-secondary"
    			: "") + "\n    " + (/*context*/ ctx[12] === "card:action"
    			? "mdc-card__action"
    			: "") + "\n    " + (/*context*/ ctx[12] === "card:action"
    			? "mdc-card__action--button"
    			: "") + "\n    " + (/*context*/ ctx[12] === "dialog:action"
    			? "mdc-dialog__button"
    			: "") + "\n    " + (/*context*/ ctx[12] === "top-app-bar:navigation"
    			? "mdc-top-app-bar__navigation-icon"
    			: "") + "\n    " + (/*context*/ ctx[12] === "top-app-bar:action"
    			? "mdc-top-app-bar__action-item"
    			: "") + "\n    " + (/*context*/ ctx[12] === "snackbar"
    			? "mdc-snackbar__action"
    			: "") + "\n  "
    		},
    		/*actionProp*/ ctx[9],
    		/*defaultProp*/ ctx[10],
    		exclude(/*$$props*/ ctx[13], [
    			"use",
    			"class",
    			"ripple",
    			"color",
    			"variant",
    			"dense",
    			.../*dialogExcludes*/ ctx[8]
    		])
    	];

    	var switch_value = /*component*/ ctx[6];

    	function switch_props(ctx) {
    		let switch_instance_props = {
    			$$slots: { default: [create_default_slot$1] },
    			$$scope: { ctx }
    		};

    		for (let i = 0; i < switch_instance_spread_levels.length; i += 1) {
    			switch_instance_props = assign(switch_instance_props, switch_instance_spread_levels[i]);
    		}

    		return { props: switch_instance_props };
    	}

    	if (switch_value) {
    		var switch_instance = new switch_value(switch_props(ctx));
    	}

    	return {
    		c() {
    			if (switch_instance) create_component(switch_instance.$$.fragment);
    			switch_instance_anchor = empty();
    		},
    		m(target, anchor) {
    			if (switch_instance) {
    				mount_component(switch_instance, target, anchor);
    			}

    			insert(target, switch_instance_anchor, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const switch_instance_changes = (dirty & /*Ripple, ripple, rippleClasses, forwardEvents, use, className, variant, dense, color, context, actionProp, defaultProp, exclude, $$props, dialogExcludes*/ 16319)
    			? get_spread_update(switch_instance_spread_levels, [
    					dirty & /*Ripple, ripple, rippleClasses, forwardEvents, use*/ 2181 && {
    						use: [
    							[
    								Ripple,
    								{
    									ripple: /*ripple*/ ctx[2],
    									unbounded: false,
    									classForward: /*func*/ ctx[18]
    								}
    							],
    							/*forwardEvents*/ ctx[11],
    							.../*use*/ ctx[0]
    						]
    					},
    					dirty & /*className, rippleClasses, variant, dense, color, context*/ 4282 && {
    						class: "\n    mdc-button\n    " + /*className*/ ctx[1] + "\n    " + /*rippleClasses*/ ctx[7].join(" ") + "\n    " + (/*variant*/ ctx[4] === "raised"
    						? "mdc-button--raised"
    						: "") + "\n    " + (/*variant*/ ctx[4] === "unelevated"
    						? "mdc-button--unelevated"
    						: "") + "\n    " + (/*variant*/ ctx[4] === "outlined"
    						? "mdc-button--outlined"
    						: "") + "\n    " + (/*dense*/ ctx[5] ? "mdc-button--dense" : "") + "\n    " + (/*color*/ ctx[3] === "secondary"
    						? "smui-button--color-secondary"
    						: "") + "\n    " + (/*context*/ ctx[12] === "card:action"
    						? "mdc-card__action"
    						: "") + "\n    " + (/*context*/ ctx[12] === "card:action"
    						? "mdc-card__action--button"
    						: "") + "\n    " + (/*context*/ ctx[12] === "dialog:action"
    						? "mdc-dialog__button"
    						: "") + "\n    " + (/*context*/ ctx[12] === "top-app-bar:navigation"
    						? "mdc-top-app-bar__navigation-icon"
    						: "") + "\n    " + (/*context*/ ctx[12] === "top-app-bar:action"
    						? "mdc-top-app-bar__action-item"
    						: "") + "\n    " + (/*context*/ ctx[12] === "snackbar"
    						? "mdc-snackbar__action"
    						: "") + "\n  "
    					},
    					dirty & /*actionProp*/ 512 && get_spread_object(/*actionProp*/ ctx[9]),
    					dirty & /*defaultProp*/ 1024 && get_spread_object(/*defaultProp*/ ctx[10]),
    					dirty & /*exclude, $$props, dialogExcludes*/ 8448 && get_spread_object(exclude(/*$$props*/ ctx[13], [
    						"use",
    						"class",
    						"ripple",
    						"color",
    						"variant",
    						"dense",
    						.../*dialogExcludes*/ ctx[8]
    					]))
    				])
    			: {};

    			if (dirty & /*$$scope*/ 524288) {
    				switch_instance_changes.$$scope = { dirty, ctx };
    			}

    			if (switch_value !== (switch_value = /*component*/ ctx[6])) {
    				if (switch_instance) {
    					group_outros();
    					const old_component = switch_instance;

    					transition_out(old_component.$$.fragment, 1, 0, () => {
    						destroy_component(old_component, 1);
    					});

    					check_outros();
    				}

    				if (switch_value) {
    					switch_instance = new switch_value(switch_props(ctx));
    					create_component(switch_instance.$$.fragment);
    					transition_in(switch_instance.$$.fragment, 1);
    					mount_component(switch_instance, switch_instance_anchor.parentNode, switch_instance_anchor);
    				} else {
    					switch_instance = null;
    				}
    			} else if (switch_value) {
    				switch_instance.$set(switch_instance_changes);
    			}
    		},
    		i(local) {
    			if (current) return;
    			if (switch_instance) transition_in(switch_instance.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			if (switch_instance) transition_out(switch_instance.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(switch_instance_anchor);
    			if (switch_instance) destroy_component(switch_instance, detaching);
    		}
    	};
    }

    function instance$a($$self, $$props, $$invalidate) {
    	const forwardEvents = forwardEventsBuilder(current_component);
    	let { use = [] } = $$props;
    	let { class: className = "" } = $$props;
    	let { ripple = true } = $$props;
    	let { color = "primary" } = $$props;
    	let { variant = "text" } = $$props;
    	let { dense = false } = $$props;
    	let { href = null } = $$props;
    	let { action = "close" } = $$props;
    	let { default: defaultAction = false } = $$props;
    	let { component = href == null ? Button : A } = $$props;
    	let context = getContext("SMUI:button:context");
    	let rippleClasses = [];
    	setContext("SMUI:label:context", "button");
    	setContext("SMUI:icon:context", "button");
    	let { $$slots = {}, $$scope } = $$props;
    	const func = classes => $$invalidate(7, rippleClasses = classes);

    	$$self.$set = $$new_props => {
    		$$invalidate(13, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		if ("use" in $$new_props) $$invalidate(0, use = $$new_props.use);
    		if ("class" in $$new_props) $$invalidate(1, className = $$new_props.class);
    		if ("ripple" in $$new_props) $$invalidate(2, ripple = $$new_props.ripple);
    		if ("color" in $$new_props) $$invalidate(3, color = $$new_props.color);
    		if ("variant" in $$new_props) $$invalidate(4, variant = $$new_props.variant);
    		if ("dense" in $$new_props) $$invalidate(5, dense = $$new_props.dense);
    		if ("href" in $$new_props) $$invalidate(14, href = $$new_props.href);
    		if ("action" in $$new_props) $$invalidate(15, action = $$new_props.action);
    		if ("default" in $$new_props) $$invalidate(16, defaultAction = $$new_props.default);
    		if ("component" in $$new_props) $$invalidate(6, component = $$new_props.component);
    		if ("$$scope" in $$new_props) $$invalidate(19, $$scope = $$new_props.$$scope);
    	};

    	let dialogExcludes;
    	let actionProp;
    	let defaultProp;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*action*/ 32768) {
    			 $$invalidate(9, actionProp = context === "dialog:action" && action !== null
    			? { "data-mdc-dialog-action": action }
    			: {});
    		}

    		if ($$self.$$.dirty & /*defaultAction*/ 65536) {
    			 $$invalidate(10, defaultProp = context === "dialog:action" && defaultAction
    			? { "data-mdc-dialog-button-default": "" }
    			: {});
    		}
    	};

    	 $$invalidate(8, dialogExcludes = context === "dialog:action" ? ["action", "default"] : []);
    	$$props = exclude_internal_props($$props);

    	return [
    		use,
    		className,
    		ripple,
    		color,
    		variant,
    		dense,
    		component,
    		rippleClasses,
    		dialogExcludes,
    		actionProp,
    		defaultProp,
    		forwardEvents,
    		context,
    		$$props,
    		href,
    		action,
    		defaultAction,
    		$$slots,
    		func,
    		$$scope
    	];
    }

    class Button_1 extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$a, create_fragment$a, safe_not_equal, {
    			use: 0,
    			class: 1,
    			ripple: 2,
    			color: 3,
    			variant: 4,
    			dense: 5,
    			href: 14,
    			action: 15,
    			default: 16,
    			component: 6
    		});
    	}
    }

    /* node_modules/@smui/common/Label.svelte generated by Svelte v3.19.1 */

    function create_fragment$b(ctx) {
    	let span;
    	let useActions_action;
    	let forwardEvents_action;
    	let current;
    	let dispose;
    	const default_slot_template = /*$$slots*/ ctx[6].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[5], null);

    	let span_levels = [
    		{
    			class: "\n    " + /*className*/ ctx[1] + "\n    " + (/*context*/ ctx[3] === "button"
    			? "mdc-button__label"
    			: "") + "\n    " + (/*context*/ ctx[3] === "fab" ? "mdc-fab__label" : "") + "\n    " + (/*context*/ ctx[3] === "chip" ? "mdc-chip__text" : "") + "\n    " + (/*context*/ ctx[3] === "tab"
    			? "mdc-tab__text-label"
    			: "") + "\n    " + (/*context*/ ctx[3] === "image-list"
    			? "mdc-image-list__label"
    			: "") + "\n    " + (/*context*/ ctx[3] === "snackbar"
    			? "mdc-snackbar__label"
    			: "") + "\n  "
    		},
    		/*context*/ ctx[3] === "snackbar"
    		? { role: "status", "aria-live": "polite" }
    		: {},
    		exclude(/*$$props*/ ctx[4], ["use", "class"])
    	];

    	let span_data = {};

    	for (let i = 0; i < span_levels.length; i += 1) {
    		span_data = assign(span_data, span_levels[i]);
    	}

    	return {
    		c() {
    			span = element("span");
    			if (default_slot) default_slot.c();
    			set_attributes(span, span_data);
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);

    			if (default_slot) {
    				default_slot.m(span, null);
    			}

    			current = true;

    			dispose = [
    				action_destroyer(useActions_action = useActions.call(null, span, /*use*/ ctx[0])),
    				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[2].call(null, span))
    			];
    		},
    		p(ctx, [dirty]) {
    			if (default_slot && default_slot.p && dirty & /*$$scope*/ 32) {
    				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[5], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[5], dirty, null));
    			}

    			set_attributes(span, get_spread_update(span_levels, [
    				dirty & /*className, context*/ 10 && {
    					class: "\n    " + /*className*/ ctx[1] + "\n    " + (/*context*/ ctx[3] === "button"
    					? "mdc-button__label"
    					: "") + "\n    " + (/*context*/ ctx[3] === "fab" ? "mdc-fab__label" : "") + "\n    " + (/*context*/ ctx[3] === "chip" ? "mdc-chip__text" : "") + "\n    " + (/*context*/ ctx[3] === "tab"
    					? "mdc-tab__text-label"
    					: "") + "\n    " + (/*context*/ ctx[3] === "image-list"
    					? "mdc-image-list__label"
    					: "") + "\n    " + (/*context*/ ctx[3] === "snackbar"
    					? "mdc-snackbar__label"
    					: "") + "\n  "
    				},
    				dirty & /*context*/ 8 && (/*context*/ ctx[3] === "snackbar"
    				? { role: "status", "aria-live": "polite" }
    				: {}),
    				dirty & /*exclude, $$props*/ 16 && exclude(/*$$props*/ ctx[4], ["use", "class"])
    			]));

    			if (useActions_action && is_function(useActions_action.update) && dirty & /*use*/ 1) useActions_action.update.call(null, /*use*/ ctx[0]);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    			if (default_slot) default_slot.d(detaching);
    			run_all(dispose);
    		}
    	};
    }

    function instance$b($$self, $$props, $$invalidate) {
    	const forwardEvents = forwardEventsBuilder(current_component);
    	let { use = [] } = $$props;
    	let { class: className = "" } = $$props;
    	const context = getContext("SMUI:label:context");
    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$set = $$new_props => {
    		$$invalidate(4, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		if ("use" in $$new_props) $$invalidate(0, use = $$new_props.use);
    		if ("class" in $$new_props) $$invalidate(1, className = $$new_props.class);
    		if ("$$scope" in $$new_props) $$invalidate(5, $$scope = $$new_props.$$scope);
    	};

    	$$props = exclude_internal_props($$props);
    	return [use, className, forwardEvents, context, $$props, $$scope, $$slots];
    }

    class Label extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$b, create_fragment$b, safe_not_equal, { use: 0, class: 1 });
    	}
    }

    const rgbToHex = (r, g, b) =>
      '#' +
      [r, g, b]
        .map((x) => {
          const hex = x.toString(16);
          return hex.length === 1 ? '0' + hex : hex;
        })
        .join('');

    const subscriber_queue = [];
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=}start start and stop notifications for subscriptions
     */
    function writable(value, start = noop) {
        let stop;
        const subscribers = [];
        function set(new_value) {
            if (safe_not_equal(value, new_value)) {
                value = new_value;
                if (stop) { // store is ready
                    const run_queue = !subscriber_queue.length;
                    for (let i = 0; i < subscribers.length; i += 1) {
                        const s = subscribers[i];
                        s[1]();
                        subscriber_queue.push(s, value);
                    }
                    if (run_queue) {
                        for (let i = 0; i < subscriber_queue.length; i += 2) {
                            subscriber_queue[i][0](subscriber_queue[i + 1]);
                        }
                        subscriber_queue.length = 0;
                    }
                }
            }
        }
        function update(fn) {
            set(fn(value));
        }
        function subscribe(run, invalidate = noop) {
            const subscriber = [run, invalidate];
            subscribers.push(subscriber);
            if (subscribers.length === 1) {
                stop = start(set) || noop;
            }
            run(value);
            return () => {
                const index = subscribers.indexOf(subscriber);
                if (index !== -1) {
                    subscribers.splice(index, 1);
                }
                if (subscribers.length === 0) {
                    stop();
                    stop = null;
                }
            };
        }
        return { set, update, subscribe };
    }

    const colorStore = writable([]);

    const addColor = (red, green, blue, name) => {
      colorStore.update((items) => {
        items.push({ red, green, blue, name, id: Date.now(), isFavorite: false });

        return items;
      });
    };

    const updateColor = (red, green, blue, name, id) => {
      colorStore.update((items) => {
        const updateItems = items.filter((i) => i.id !== id);
        const item = items.find((i) => i.id === id);

        const isFavorite = item ? item.isFavorite : false;

        return [...updateItems, { red, green, blue, name, id, isFavorite }];
      });
    };

    const updateFavorite = (itemId, isFavorite) => {
      colorStore.update((items) => {
        const updateItems = items.filter((i) => i.id !== itemId);
        const item = items.find((i) => i.id === itemId);
        const { red, green, blue, name, id } = item;

        return [...updateItems, { red, green, blue, name, id, isFavorite }];
      });
    };

    const deleteColor = (id) => {
      colorStore.update((items) => {
        return items.filter((i) => i.id !== id);
      });
    };

    if (localStorage.getItem('color-list')) {
      colorStore.set(JSON.parse(localStorage.getItem('color-list')));
    }

    colorStore.subscribe((colors) => {
      localStorage.setItem('color-list', JSON.stringify(colors));
    });

    var colorStore$1 = {
      subscribe: colorStore.subscribe,
      addColor,
      updateColor,
      deleteColor,
      updateFavorite
    };

    const selectedColor = writable(null);

    var selectedColor$1 = {
      subscribe: selectedColor.subscribe,
      selectColor: (red, green, blue, name, id) => {
        selectedColor.set({ red, green, blue, name, id });
      }
    };

    /* src/SaveColor.svelte generated by Svelte v3.19.1 */

    function create_else_block$2(ctx) {
    	let div;
    	let current;

    	const button = new Button_1({
    			props: {
    				disabled: !/*canSaveColor*/ ctx[5],
    				class: "save-color-btn",
    				variant: "unelevated",
    				color: "primary",
    				$$slots: { default: [create_default_slot_4] },
    				$$scope: { ctx }
    			}
    		});

    	button.$on("click", /*saveColor*/ ctx[8]);

    	return {
    		c() {
    			div = element("div");
    			create_component(button.$$.fragment);
    			attr(div, "bp", "2");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			mount_component(button, div, null);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const button_changes = {};
    			if (dirty & /*canSaveColor*/ 32) button_changes.disabled = !/*canSaveColor*/ ctx[5];

    			if (dirty & /*$$scope*/ 65536) {
    				button_changes.$$scope = { dirty, ctx };
    			}

    			button.$set(button_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(button.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(button.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			destroy_component(button);
    		}
    	};
    }

    // (93:2) {#if mode === 'edit'}
    function create_if_block$4(ctx) {
    	let div0;
    	let t;
    	let div1;
    	let current;

    	const button0 = new Button_1({
    			props: {
    				disabled: !/*canSaveColor*/ ctx[5],
    				variant: "unelevated",
    				color: "primary",
    				$$slots: { default: [create_default_slot_2$1] },
    				$$scope: { ctx }
    			}
    		});

    	button0.$on("click", /*editColor*/ ctx[9]);

    	const button1 = new Button_1({
    			props: {
    				variant: "unelevated",
    				color: "secondary",
    				$$slots: { default: [create_default_slot$2] },
    				$$scope: { ctx }
    			}
    		});

    	button1.$on("click", /*reset*/ ctx[10]);

    	return {
    		c() {
    			div0 = element("div");
    			create_component(button0.$$.fragment);
    			t = space();
    			div1 = element("div");
    			create_component(button1.$$.fragment);
    			attr(div0, "bp", "1");
    			attr(div1, "bp", "1");
    		},
    		m(target, anchor) {
    			insert(target, div0, anchor);
    			mount_component(button0, div0, null);
    			insert(target, t, anchor);
    			insert(target, div1, anchor);
    			mount_component(button1, div1, null);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const button0_changes = {};
    			if (dirty & /*canSaveColor*/ 32) button0_changes.disabled = !/*canSaveColor*/ ctx[5];

    			if (dirty & /*$$scope*/ 65536) {
    				button0_changes.$$scope = { dirty, ctx };
    			}

    			button0.$set(button0_changes);
    			const button1_changes = {};

    			if (dirty & /*$$scope*/ 65536) {
    				button1_changes.$$scope = { dirty, ctx };
    			}

    			button1.$set(button1_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(button0.$$.fragment, local);
    			transition_in(button1.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(button0.$$.fragment, local);
    			transition_out(button1.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div0);
    			destroy_component(button0);
    			if (detaching) detach(t);
    			if (detaching) detach(div1);
    			destroy_component(button1);
    		}
    	};
    }

    // (117:8) <Label>
    function create_default_slot_5(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Save Color");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (111:6) <Button         on:click={saveColor}         disabled={!canSaveColor}         class="save-color-btn"         variant="unelevated"         color="primary">
    function create_default_slot_4(ctx) {
    	let current;

    	const label = new Label({
    			props: {
    				$$slots: { default: [create_default_slot_5] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(label.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(label, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const label_changes = {};

    			if (dirty & /*$$scope*/ 65536) {
    				label_changes.$$scope = { dirty, ctx };
    			}

    			label.$set(label_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(label.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(label.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(label, detaching);
    		}
    	};
    }

    // (100:8) <Label>
    function create_default_slot_3(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Edit Color");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (95:6) <Button         on:click={editColor}         disabled={!canSaveColor}         variant="unelevated"         color="primary">
    function create_default_slot_2$1(ctx) {
    	let current;

    	const label = new Label({
    			props: {
    				$$slots: { default: [create_default_slot_3] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(label.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(label, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const label_changes = {};

    			if (dirty & /*$$scope*/ 65536) {
    				label_changes.$$scope = { dirty, ctx };
    			}

    			label.$set(label_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(label.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(label.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(label, detaching);
    		}
    	};
    }

    // (106:8) <Label>
    function create_default_slot_1$1(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Cancel");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (105:6) <Button on:click={reset} variant="unelevated" color="secondary">
    function create_default_slot$2(ctx) {
    	let current;

    	const label = new Label({
    			props: {
    				$$slots: { default: [create_default_slot_1$1] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(label.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(label, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const label_changes = {};

    			if (dirty & /*$$scope*/ 65536) {
    				label_changes.$$scope = { dirty, ctx };
    			}

    			label.$set(label_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(label.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(label.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(label, detaching);
    		}
    	};
    }

    function create_fragment$c(ctx) {
    	let div1;
    	let div0;
    	let form;
    	let updating_value;
    	let t0;
    	let current_block_type_index;
    	let if_block;
    	let t1;
    	let div2;
    	let updating_color;
    	let t2;
    	let updating_color_1;
    	let t3;
    	let updating_color_2;
    	let t4;
    	let div4;
    	let div3;
    	let t5;
    	let div7;
    	let div5;
    	let t6;
    	let br0;
    	let t7;
    	let t8;
    	let t9;
    	let t10;
    	let t11;
    	let t12;
    	let t13;
    	let div6;
    	let t14;
    	let br1;
    	let t15;
    	let t16;
    	let current;
    	let dispose;

    	function textfield_value_binding(value) {
    		/*textfield_value_binding*/ ctx[12].call(null, value);
    	}

    	let textfield_props = { label: "Name", fullwidth: "true" };

    	if (/*name*/ ctx[4] !== void 0) {
    		textfield_props.value = /*name*/ ctx[4];
    	}

    	const textfield = new Textfield({ props: textfield_props });
    	binding_callbacks.push(() => bind(textfield, "value", textfield_value_binding));
    	const if_block_creators = [create_if_block$4, create_else_block$2];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*mode*/ ctx[0] === "edit") return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	function slider0_color_binding(value) {
    		/*slider0_color_binding*/ ctx[13].call(null, value);
    	}

    	let slider0_props = { bgColor: "#AA0000" };

    	if (/*red*/ ctx[1] !== void 0) {
    		slider0_props.color = /*red*/ ctx[1];
    	}

    	const slider0 = new Slider_1({ props: slider0_props });
    	binding_callbacks.push(() => bind(slider0, "color", slider0_color_binding));

    	function slider1_color_binding(value) {
    		/*slider1_color_binding*/ ctx[14].call(null, value);
    	}

    	let slider1_props = { bgColor: "#00AA00" };

    	if (/*green*/ ctx[2] !== void 0) {
    		slider1_props.color = /*green*/ ctx[2];
    	}

    	const slider1 = new Slider_1({ props: slider1_props });
    	binding_callbacks.push(() => bind(slider1, "color", slider1_color_binding));

    	function slider2_color_binding(value) {
    		/*slider2_color_binding*/ ctx[15].call(null, value);
    	}

    	let slider2_props = { bgColor: "#0000AA" };

    	if (/*blue*/ ctx[3] !== void 0) {
    		slider2_props.color = /*blue*/ ctx[3];
    	}

    	const slider2 = new Slider_1({ props: slider2_props });
    	binding_callbacks.push(() => bind(slider2, "color", slider2_color_binding));

    	return {
    		c() {
    			div1 = element("div");
    			div0 = element("div");
    			form = element("form");
    			create_component(textfield.$$.fragment);
    			t0 = space();
    			if_block.c();
    			t1 = space();
    			div2 = element("div");
    			create_component(slider0.$$.fragment);
    			t2 = space();
    			create_component(slider1.$$.fragment);
    			t3 = space();
    			create_component(slider2.$$.fragment);
    			t4 = space();
    			div4 = element("div");
    			div3 = element("div");
    			t5 = space();
    			div7 = element("div");
    			div5 = element("div");
    			t6 = text("RGB\n    ");
    			br0 = element("br");
    			t7 = text("\n    r=");
    			t8 = text(/*red*/ ctx[1]);
    			t9 = text(", g=");
    			t10 = text(/*green*/ ctx[2]);
    			t11 = text(", b=");
    			t12 = text(/*blue*/ ctx[3]);
    			t13 = space();
    			div6 = element("div");
    			t14 = text("HEX\n    ");
    			br1 = element("br");
    			t15 = space();
    			t16 = text(/*hex*/ ctx[6]);
    			attr(div0, "bp", "8 offset-2");
    			attr(div1, "class", "form svelte-xzxj7j");
    			attr(div1, "bp", "grid vertical-end");
    			attr(div2, "class", "color-controls svelte-xzxj7j");
    			attr(div3, "class", "color-display svelte-xzxj7j");
    			set_style(div3, "background-color", "rgb(" + /*red*/ ctx[1] + ", " + /*green*/ ctx[2] + ", " + /*blue*/ ctx[3] + ")");
    			attr(div3, "bp", "offset-2 10");
    			attr(div4, "bp", "grid");
    			attr(div4, "class", "svelte-xzxj7j");
    			attr(div5, "bp", "offset-2 5");
    			attr(div5, "class", "svelte-xzxj7j");
    			attr(div6, "bp", "5");
    			attr(div6, "class", "svelte-xzxj7j");
    			attr(div7, "class", "color-numbers svelte-xzxj7j");
    			attr(div7, "bp", "grid");
    		},
    		m(target, anchor) {
    			insert(target, div1, anchor);
    			append(div1, div0);
    			append(div0, form);
    			mount_component(textfield, form, null);
    			append(div1, t0);
    			if_blocks[current_block_type_index].m(div1, null);
    			insert(target, t1, anchor);
    			insert(target, div2, anchor);
    			mount_component(slider0, div2, null);
    			append(div2, t2);
    			mount_component(slider1, div2, null);
    			append(div2, t3);
    			mount_component(slider2, div2, null);
    			insert(target, t4, anchor);
    			insert(target, div4, anchor);
    			append(div4, div3);
    			insert(target, t5, anchor);
    			insert(target, div7, anchor);
    			append(div7, div5);
    			append(div5, t6);
    			append(div5, br0);
    			append(div5, t7);
    			append(div5, t8);
    			append(div5, t9);
    			append(div5, t10);
    			append(div5, t11);
    			append(div5, t12);
    			append(div7, t13);
    			append(div7, div6);
    			append(div6, t14);
    			append(div6, br1);
    			append(div6, t15);
    			append(div6, t16);
    			current = true;
    			dispose = listen(form, "submit", prevent_default(/*submitColor*/ ctx[7]));
    		},
    		p(ctx, [dirty]) {
    			const textfield_changes = {};

    			if (!updating_value && dirty & /*name*/ 16) {
    				updating_value = true;
    				textfield_changes.value = /*name*/ ctx[4];
    				add_flush_callback(() => updating_value = false);
    			}

    			textfield.$set(textfield_changes);
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in(if_block, 1);
    				if_block.m(div1, null);
    			}

    			const slider0_changes = {};

    			if (!updating_color && dirty & /*red*/ 2) {
    				updating_color = true;
    				slider0_changes.color = /*red*/ ctx[1];
    				add_flush_callback(() => updating_color = false);
    			}

    			slider0.$set(slider0_changes);
    			const slider1_changes = {};

    			if (!updating_color_1 && dirty & /*green*/ 4) {
    				updating_color_1 = true;
    				slider1_changes.color = /*green*/ ctx[2];
    				add_flush_callback(() => updating_color_1 = false);
    			}

    			slider1.$set(slider1_changes);
    			const slider2_changes = {};

    			if (!updating_color_2 && dirty & /*blue*/ 8) {
    				updating_color_2 = true;
    				slider2_changes.color = /*blue*/ ctx[3];
    				add_flush_callback(() => updating_color_2 = false);
    			}

    			slider2.$set(slider2_changes);

    			if (!current || dirty & /*red, green, blue*/ 14) {
    				set_style(div3, "background-color", "rgb(" + /*red*/ ctx[1] + ", " + /*green*/ ctx[2] + ", " + /*blue*/ ctx[3] + ")");
    			}

    			if (!current || dirty & /*red*/ 2) set_data(t8, /*red*/ ctx[1]);
    			if (!current || dirty & /*green*/ 4) set_data(t10, /*green*/ ctx[2]);
    			if (!current || dirty & /*blue*/ 8) set_data(t12, /*blue*/ ctx[3]);
    			if (!current || dirty & /*hex*/ 64) set_data(t16, /*hex*/ ctx[6]);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(textfield.$$.fragment, local);
    			transition_in(if_block);
    			transition_in(slider0.$$.fragment, local);
    			transition_in(slider1.$$.fragment, local);
    			transition_in(slider2.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(textfield.$$.fragment, local);
    			transition_out(if_block);
    			transition_out(slider0.$$.fragment, local);
    			transition_out(slider1.$$.fragment, local);
    			transition_out(slider2.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div1);
    			destroy_component(textfield);
    			if_blocks[current_block_type_index].d();
    			if (detaching) detach(t1);
    			if (detaching) detach(div2);
    			destroy_component(slider0);
    			destroy_component(slider1);
    			destroy_component(slider2);
    			if (detaching) detach(t4);
    			if (detaching) detach(div4);
    			if (detaching) detach(t5);
    			if (detaching) detach(div7);
    			dispose();
    		}
    	};
    }

    function instance$c($$self, $$props, $$invalidate) {
    	let mode = "new";
    	let id = null;
    	let red = 100;
    	let green = 200;
    	let blue = 10;
    	let name = "";

    	onMount(() => {
    		reset();

    		selectedColor$1.subscribe(color => {
    			if (!color) {
    				return;
    			}

    			console.log(color, "color");
    			$$invalidate(1, { red, green, blue, name, id } = color, red, $$invalidate(2, green), $$invalidate(3, blue), $$invalidate(4, name));
    			$$invalidate(0, mode = "edit");
    		});
    	});

    	function submitColor() {
    		if (mode === "new") {
    			saveColor();
    			return;
    		}

    		editColor();
    	}

    	function saveColor() {
    		colorStore$1.addColor(red, green, blue, name);
    		reset();
    	}

    	function editColor() {
    		colorStore$1.updateColor(red, green, blue, name, id);
    		reset();
    	}

    	function reset() {
    		$$invalidate(1, red = 200);
    		$$invalidate(2, green = 100);
    		$$invalidate(3, blue = 10);
    		$$invalidate(0, mode = "new");
    		$$invalidate(4, name = "");
    	}

    	function textfield_value_binding(value) {
    		name = value;
    		$$invalidate(4, name);
    	}

    	function slider0_color_binding(value) {
    		red = value;
    		$$invalidate(1, red);
    	}

    	function slider1_color_binding(value) {
    		green = value;
    		$$invalidate(2, green);
    	}

    	function slider2_color_binding(value) {
    		blue = value;
    		$$invalidate(3, blue);
    	}

    	let canSaveColor;
    	let hex;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*name*/ 16) {
    			 $$invalidate(5, canSaveColor = name.length >= 3);
    		}

    		if ($$self.$$.dirty & /*red, green, blue*/ 14) {
    			 $$invalidate(6, hex = rgbToHex(red, green, blue));
    		}
    	};

    	return [
    		mode,
    		red,
    		green,
    		blue,
    		name,
    		canSaveColor,
    		hex,
    		submitColor,
    		saveColor,
    		editColor,
    		reset,
    		id,
    		textfield_value_binding,
    		slider0_color_binding,
    		slider1_color_binding,
    		slider2_color_binding
    	];
    }

    class SaveColor extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$c, create_fragment$c, safe_not_equal, {});
    	}
    }

    /**
     * @license
     * Copyright 2016 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var cssClasses$9 = {
        ANIM_CHECKED_INDETERMINATE: 'mdc-checkbox--anim-checked-indeterminate',
        ANIM_CHECKED_UNCHECKED: 'mdc-checkbox--anim-checked-unchecked',
        ANIM_INDETERMINATE_CHECKED: 'mdc-checkbox--anim-indeterminate-checked',
        ANIM_INDETERMINATE_UNCHECKED: 'mdc-checkbox--anim-indeterminate-unchecked',
        ANIM_UNCHECKED_CHECKED: 'mdc-checkbox--anim-unchecked-checked',
        ANIM_UNCHECKED_INDETERMINATE: 'mdc-checkbox--anim-unchecked-indeterminate',
        BACKGROUND: 'mdc-checkbox__background',
        CHECKED: 'mdc-checkbox--checked',
        CHECKMARK: 'mdc-checkbox__checkmark',
        CHECKMARK_PATH: 'mdc-checkbox__checkmark-path',
        DISABLED: 'mdc-checkbox--disabled',
        INDETERMINATE: 'mdc-checkbox--indeterminate',
        MIXEDMARK: 'mdc-checkbox__mixedmark',
        NATIVE_CONTROL: 'mdc-checkbox__native-control',
        ROOT: 'mdc-checkbox',
        SELECTED: 'mdc-checkbox--selected',
        UPGRADED: 'mdc-checkbox--upgraded',
    };
    var strings$7 = {
        ARIA_CHECKED_ATTR: 'aria-checked',
        ARIA_CHECKED_INDETERMINATE_VALUE: 'mixed',
        NATIVE_CONTROL_SELECTOR: '.mdc-checkbox__native-control',
        TRANSITION_STATE_CHECKED: 'checked',
        TRANSITION_STATE_INDETERMINATE: 'indeterminate',
        TRANSITION_STATE_INIT: 'init',
        TRANSITION_STATE_UNCHECKED: 'unchecked',
    };
    var numbers$4 = {
        ANIM_END_LATCH_MS: 250,
    };

    /**
     * @license
     * Copyright 2016 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var MDCCheckboxFoundation = /** @class */ (function (_super) {
        __extends(MDCCheckboxFoundation, _super);
        function MDCCheckboxFoundation(adapter) {
            var _this = _super.call(this, __assign({}, MDCCheckboxFoundation.defaultAdapter, adapter)) || this;
            _this.currentCheckState_ = strings$7.TRANSITION_STATE_INIT;
            _this.currentAnimationClass_ = '';
            _this.animEndLatchTimer_ = 0;
            _this.enableAnimationEndHandler_ = false;
            return _this;
        }
        Object.defineProperty(MDCCheckboxFoundation, "cssClasses", {
            get: function () {
                return cssClasses$9;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCCheckboxFoundation, "strings", {
            get: function () {
                return strings$7;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCCheckboxFoundation, "numbers", {
            get: function () {
                return numbers$4;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCCheckboxFoundation, "defaultAdapter", {
            get: function () {
                return {
                    addClass: function () { return undefined; },
                    forceLayout: function () { return undefined; },
                    hasNativeControl: function () { return false; },
                    isAttachedToDOM: function () { return false; },
                    isChecked: function () { return false; },
                    isIndeterminate: function () { return false; },
                    removeClass: function () { return undefined; },
                    removeNativeControlAttr: function () { return undefined; },
                    setNativeControlAttr: function () { return undefined; },
                    setNativeControlDisabled: function () { return undefined; },
                };
            },
            enumerable: true,
            configurable: true
        });
        MDCCheckboxFoundation.prototype.init = function () {
            this.currentCheckState_ = this.determineCheckState_();
            this.updateAriaChecked_();
            this.adapter_.addClass(cssClasses$9.UPGRADED);
        };
        MDCCheckboxFoundation.prototype.destroy = function () {
            clearTimeout(this.animEndLatchTimer_);
        };
        MDCCheckboxFoundation.prototype.setDisabled = function (disabled) {
            this.adapter_.setNativeControlDisabled(disabled);
            if (disabled) {
                this.adapter_.addClass(cssClasses$9.DISABLED);
            }
            else {
                this.adapter_.removeClass(cssClasses$9.DISABLED);
            }
        };
        /**
         * Handles the animationend event for the checkbox
         */
        MDCCheckboxFoundation.prototype.handleAnimationEnd = function () {
            var _this = this;
            if (!this.enableAnimationEndHandler_) {
                return;
            }
            clearTimeout(this.animEndLatchTimer_);
            this.animEndLatchTimer_ = setTimeout(function () {
                _this.adapter_.removeClass(_this.currentAnimationClass_);
                _this.enableAnimationEndHandler_ = false;
            }, numbers$4.ANIM_END_LATCH_MS);
        };
        /**
         * Handles the change event for the checkbox
         */
        MDCCheckboxFoundation.prototype.handleChange = function () {
            this.transitionCheckState_();
        };
        MDCCheckboxFoundation.prototype.transitionCheckState_ = function () {
            if (!this.adapter_.hasNativeControl()) {
                return;
            }
            var oldState = this.currentCheckState_;
            var newState = this.determineCheckState_();
            if (oldState === newState) {
                return;
            }
            this.updateAriaChecked_();
            var TRANSITION_STATE_UNCHECKED = strings$7.TRANSITION_STATE_UNCHECKED;
            var SELECTED = cssClasses$9.SELECTED;
            if (newState === TRANSITION_STATE_UNCHECKED) {
                this.adapter_.removeClass(SELECTED);
            }
            else {
                this.adapter_.addClass(SELECTED);
            }
            // Check to ensure that there isn't a previously existing animation class, in case for example
            // the user interacted with the checkbox before the animation was finished.
            if (this.currentAnimationClass_.length > 0) {
                clearTimeout(this.animEndLatchTimer_);
                this.adapter_.forceLayout();
                this.adapter_.removeClass(this.currentAnimationClass_);
            }
            this.currentAnimationClass_ = this.getTransitionAnimationClass_(oldState, newState);
            this.currentCheckState_ = newState;
            // Check for parentNode so that animations are only run when the element is attached
            // to the DOM.
            if (this.adapter_.isAttachedToDOM() && this.currentAnimationClass_.length > 0) {
                this.adapter_.addClass(this.currentAnimationClass_);
                this.enableAnimationEndHandler_ = true;
            }
        };
        MDCCheckboxFoundation.prototype.determineCheckState_ = function () {
            var TRANSITION_STATE_INDETERMINATE = strings$7.TRANSITION_STATE_INDETERMINATE, TRANSITION_STATE_CHECKED = strings$7.TRANSITION_STATE_CHECKED, TRANSITION_STATE_UNCHECKED = strings$7.TRANSITION_STATE_UNCHECKED;
            if (this.adapter_.isIndeterminate()) {
                return TRANSITION_STATE_INDETERMINATE;
            }
            return this.adapter_.isChecked() ? TRANSITION_STATE_CHECKED : TRANSITION_STATE_UNCHECKED;
        };
        MDCCheckboxFoundation.prototype.getTransitionAnimationClass_ = function (oldState, newState) {
            var TRANSITION_STATE_INIT = strings$7.TRANSITION_STATE_INIT, TRANSITION_STATE_CHECKED = strings$7.TRANSITION_STATE_CHECKED, TRANSITION_STATE_UNCHECKED = strings$7.TRANSITION_STATE_UNCHECKED;
            var _a = MDCCheckboxFoundation.cssClasses, ANIM_UNCHECKED_CHECKED = _a.ANIM_UNCHECKED_CHECKED, ANIM_UNCHECKED_INDETERMINATE = _a.ANIM_UNCHECKED_INDETERMINATE, ANIM_CHECKED_UNCHECKED = _a.ANIM_CHECKED_UNCHECKED, ANIM_CHECKED_INDETERMINATE = _a.ANIM_CHECKED_INDETERMINATE, ANIM_INDETERMINATE_CHECKED = _a.ANIM_INDETERMINATE_CHECKED, ANIM_INDETERMINATE_UNCHECKED = _a.ANIM_INDETERMINATE_UNCHECKED;
            switch (oldState) {
                case TRANSITION_STATE_INIT:
                    if (newState === TRANSITION_STATE_UNCHECKED) {
                        return '';
                    }
                    return newState === TRANSITION_STATE_CHECKED ? ANIM_INDETERMINATE_CHECKED : ANIM_INDETERMINATE_UNCHECKED;
                case TRANSITION_STATE_UNCHECKED:
                    return newState === TRANSITION_STATE_CHECKED ? ANIM_UNCHECKED_CHECKED : ANIM_UNCHECKED_INDETERMINATE;
                case TRANSITION_STATE_CHECKED:
                    return newState === TRANSITION_STATE_UNCHECKED ? ANIM_CHECKED_UNCHECKED : ANIM_CHECKED_INDETERMINATE;
                default: // TRANSITION_STATE_INDETERMINATE
                    return newState === TRANSITION_STATE_CHECKED ? ANIM_INDETERMINATE_CHECKED : ANIM_INDETERMINATE_UNCHECKED;
            }
        };
        MDCCheckboxFoundation.prototype.updateAriaChecked_ = function () {
            // Ensure aria-checked is set to mixed if checkbox is in indeterminate state.
            if (this.adapter_.isIndeterminate()) {
                this.adapter_.setNativeControlAttr(strings$7.ARIA_CHECKED_ATTR, strings$7.ARIA_CHECKED_INDETERMINATE_VALUE);
            }
            else {
                // The on/off state does not need to keep track of aria-checked, since
                // the screenreader uses the checked property on the checkbox element.
                this.adapter_.removeNativeControlAttr(strings$7.ARIA_CHECKED_ATTR);
            }
        };
        return MDCCheckboxFoundation;
    }(MDCFoundation));

    /**
     * @license
     * Copyright 2016 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var CB_PROTO_PROPS = ['checked', 'indeterminate'];
    var MDCCheckbox = /** @class */ (function (_super) {
        __extends(MDCCheckbox, _super);
        function MDCCheckbox() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.ripple_ = _this.createRipple_();
            return _this;
        }
        MDCCheckbox.attachTo = function (root) {
            return new MDCCheckbox(root);
        };
        Object.defineProperty(MDCCheckbox.prototype, "ripple", {
            get: function () {
                return this.ripple_;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCCheckbox.prototype, "checked", {
            get: function () {
                return this.nativeControl_.checked;
            },
            set: function (checked) {
                this.nativeControl_.checked = checked;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCCheckbox.prototype, "indeterminate", {
            get: function () {
                return this.nativeControl_.indeterminate;
            },
            set: function (indeterminate) {
                this.nativeControl_.indeterminate = indeterminate;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCCheckbox.prototype, "disabled", {
            get: function () {
                return this.nativeControl_.disabled;
            },
            set: function (disabled) {
                this.foundation_.setDisabled(disabled);
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCCheckbox.prototype, "value", {
            get: function () {
                return this.nativeControl_.value;
            },
            set: function (value) {
                this.nativeControl_.value = value;
            },
            enumerable: true,
            configurable: true
        });
        MDCCheckbox.prototype.initialSyncWithDOM = function () {
            var _this = this;
            this.handleChange_ = function () { return _this.foundation_.handleChange(); };
            this.handleAnimationEnd_ = function () { return _this.foundation_.handleAnimationEnd(); };
            this.nativeControl_.addEventListener('change', this.handleChange_);
            this.listen(getCorrectEventName(window, 'animationend'), this.handleAnimationEnd_);
            this.installPropertyChangeHooks_();
        };
        MDCCheckbox.prototype.destroy = function () {
            this.ripple_.destroy();
            this.nativeControl_.removeEventListener('change', this.handleChange_);
            this.unlisten(getCorrectEventName(window, 'animationend'), this.handleAnimationEnd_);
            this.uninstallPropertyChangeHooks_();
            _super.prototype.destroy.call(this);
        };
        MDCCheckbox.prototype.getDefaultFoundation = function () {
            var _this = this;
            // DO NOT INLINE this variable. For backward compatibility, foundations take a Partial<MDCFooAdapter>.
            // To ensure we don't accidentally omit any methods, we need a separate, strongly typed adapter variable.
            var adapter = {
                addClass: function (className) { return _this.root_.classList.add(className); },
                forceLayout: function () { return _this.root_.offsetWidth; },
                hasNativeControl: function () { return !!_this.nativeControl_; },
                isAttachedToDOM: function () { return Boolean(_this.root_.parentNode); },
                isChecked: function () { return _this.checked; },
                isIndeterminate: function () { return _this.indeterminate; },
                removeClass: function (className) { return _this.root_.classList.remove(className); },
                removeNativeControlAttr: function (attr) { return _this.nativeControl_.removeAttribute(attr); },
                setNativeControlAttr: function (attr, value) { return _this.nativeControl_.setAttribute(attr, value); },
                setNativeControlDisabled: function (disabled) { return _this.nativeControl_.disabled = disabled; },
            };
            return new MDCCheckboxFoundation(adapter);
        };
        MDCCheckbox.prototype.createRipple_ = function () {
            var _this = this;
            // DO NOT INLINE this variable. For backward compatibility, foundations take a Partial<MDCFooAdapter>.
            // To ensure we don't accidentally omit any methods, we need a separate, strongly typed adapter variable.
            var adapter = __assign({}, MDCRipple.createAdapter(this), { deregisterInteractionHandler: function (evtType, handler) { return _this.nativeControl_.removeEventListener(evtType, handler, applyPassive()); }, isSurfaceActive: function () { return matches(_this.nativeControl_, ':active'); }, isUnbounded: function () { return true; }, registerInteractionHandler: function (evtType, handler) { return _this.nativeControl_.addEventListener(evtType, handler, applyPassive()); } });
            return new MDCRipple(this.root_, new MDCRippleFoundation(adapter));
        };
        MDCCheckbox.prototype.installPropertyChangeHooks_ = function () {
            var _this = this;
            var nativeCb = this.nativeControl_;
            var cbProto = Object.getPrototypeOf(nativeCb);
            CB_PROTO_PROPS.forEach(function (controlState) {
                var desc = Object.getOwnPropertyDescriptor(cbProto, controlState);
                // We have to check for this descriptor, since some browsers (Safari) don't support its return.
                // See: https://bugs.webkit.org/show_bug.cgi?id=49739
                if (!validDescriptor(desc)) {
                    return;
                }
                // Type cast is needed for compatibility with Closure Compiler.
                var nativeGetter = desc.get;
                var nativeCbDesc = {
                    configurable: desc.configurable,
                    enumerable: desc.enumerable,
                    get: nativeGetter,
                    set: function (state) {
                        desc.set.call(nativeCb, state);
                        _this.foundation_.handleChange();
                    },
                };
                Object.defineProperty(nativeCb, controlState, nativeCbDesc);
            });
        };
        MDCCheckbox.prototype.uninstallPropertyChangeHooks_ = function () {
            var nativeCb = this.nativeControl_;
            var cbProto = Object.getPrototypeOf(nativeCb);
            CB_PROTO_PROPS.forEach(function (controlState) {
                var desc = Object.getOwnPropertyDescriptor(cbProto, controlState);
                if (!validDescriptor(desc)) {
                    return;
                }
                Object.defineProperty(nativeCb, controlState, desc);
            });
        };
        Object.defineProperty(MDCCheckbox.prototype, "nativeControl_", {
            get: function () {
                var NATIVE_CONTROL_SELECTOR = MDCCheckboxFoundation.strings.NATIVE_CONTROL_SELECTOR;
                var el = this.root_.querySelector(NATIVE_CONTROL_SELECTOR);
                if (!el) {
                    throw new Error("Checkbox component requires a " + NATIVE_CONTROL_SELECTOR + " element");
                }
                return el;
            },
            enumerable: true,
            configurable: true
        });
        return MDCCheckbox;
    }(MDCComponent));
    function validDescriptor(inputPropDesc) {
        return !!inputPropDesc && typeof inputPropDesc.set === 'function';
    }

    /**
     * @license
     * Copyright 2019 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var cssClasses$a = {
        CELL: 'mdc-data-table__cell',
        CELL_NUMERIC: 'mdc-data-table__cell--numeric',
        CONTENT: 'mdc-data-table__content',
        HEADER_ROW: 'mdc-data-table__header-row',
        HEADER_ROW_CHECKBOX: 'mdc-data-table__header-row-checkbox',
        ROOT: 'mdc-data-table',
        ROW: 'mdc-data-table__row',
        ROW_CHECKBOX: 'mdc-data-table__row-checkbox',
        ROW_SELECTED: 'mdc-data-table__row--selected',
    };
    var strings$8 = {
        ARIA_SELECTED: 'aria-selected',
        DATA_ROW_ID_ATTR: 'data-row-id',
        HEADER_ROW_CHECKBOX_SELECTOR: "." + cssClasses$a.HEADER_ROW_CHECKBOX,
        ROW_CHECKBOX_SELECTOR: "." + cssClasses$a.ROW_CHECKBOX,
        ROW_SELECTED_SELECTOR: "." + cssClasses$a.ROW_SELECTED,
        ROW_SELECTOR: "." + cssClasses$a.ROW,
    };
    var events = {
        ROW_SELECTION_CHANGED: 'MDCDataTable:rowSelectionChanged',
        SELECTED_ALL: 'MDCDataTable:selectedAll',
        UNSELECTED_ALL: 'MDCDataTable:unselectedAll',
    };

    /**
     * @license
     * Copyright 2019 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var MDCDataTableFoundation = /** @class */ (function (_super) {
        __extends(MDCDataTableFoundation, _super);
        function MDCDataTableFoundation(adapter) {
            return _super.call(this, __assign({}, MDCDataTableFoundation.defaultAdapter, adapter)) || this;
        }
        Object.defineProperty(MDCDataTableFoundation, "defaultAdapter", {
            get: function () {
                return {
                    addClassAtRowIndex: function () { return undefined; },
                    getRowCount: function () { return 0; },
                    getRowElements: function () { return []; },
                    getRowIdAtIndex: function () { return ''; },
                    getRowIndexByChildElement: function () { return 0; },
                    getSelectedRowCount: function () { return 0; },
                    isCheckboxAtRowIndexChecked: function () { return false; },
                    isHeaderRowCheckboxChecked: function () { return false; },
                    isRowsSelectable: function () { return false; },
                    notifyRowSelectionChanged: function () { return undefined; },
                    notifySelectedAll: function () { return undefined; },
                    notifyUnselectedAll: function () { return undefined; },
                    registerHeaderRowCheckbox: function () { return undefined; },
                    registerRowCheckboxes: function () { return undefined; },
                    removeClassAtRowIndex: function () { return undefined; },
                    setAttributeAtRowIndex: function () { return undefined; },
                    setHeaderRowCheckboxChecked: function () { return undefined; },
                    setHeaderRowCheckboxIndeterminate: function () { return undefined; },
                    setRowCheckboxCheckedAtIndex: function () { return undefined; },
                };
            },
            enumerable: true,
            configurable: true
        });
        /**
         * Re-initializes header row checkbox and row checkboxes when selectable rows are added or removed from table.
         * Use this if registering checkbox is synchronous.
         */
        MDCDataTableFoundation.prototype.layout = function () {
            if (this.adapter_.isRowsSelectable()) {
                this.adapter_.registerHeaderRowCheckbox();
                this.adapter_.registerRowCheckboxes();
                this.setHeaderRowCheckboxState_();
            }
        };
        /**
         * Re-initializes header row checkbox and row checkboxes when selectable rows are added or removed from table.
         * Use this if registering checkbox is asynchronous.
         */
        MDCDataTableFoundation.prototype.layoutAsync = function () {
            return __awaiter(this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            if (!this.adapter_.isRowsSelectable()) return [3 /*break*/, 3];
                            return [4 /*yield*/, this.adapter_.registerHeaderRowCheckbox()];
                        case 1:
                            _a.sent();
                            return [4 /*yield*/, this.adapter_.registerRowCheckboxes()];
                        case 2:
                            _a.sent();
                            this.setHeaderRowCheckboxState_();
                            _a.label = 3;
                        case 3: return [2 /*return*/];
                    }
                });
            });
        };
        /**
         * @return Returns array of row elements.
         */
        MDCDataTableFoundation.prototype.getRows = function () {
            return this.adapter_.getRowElements();
        };
        /**
         * Sets selected row ids. Overwrites previously selected rows.
         * @param rowIds Array of row ids that needs to be selected.
         */
        MDCDataTableFoundation.prototype.setSelectedRowIds = function (rowIds) {
            for (var rowIndex = 0; rowIndex < this.adapter_.getRowCount(); rowIndex++) {
                var rowId = this.adapter_.getRowIdAtIndex(rowIndex);
                var isSelected = false;
                if (rowId && rowIds.indexOf(rowId) >= 0) {
                    isSelected = true;
                }
                this.adapter_.setRowCheckboxCheckedAtIndex(rowIndex, isSelected);
                this.selectRowAtIndex_(rowIndex, isSelected);
            }
            this.setHeaderRowCheckboxState_();
        };
        /**
         * @return Returns array of selected row ids.
         */
        MDCDataTableFoundation.prototype.getSelectedRowIds = function () {
            var selectedRowIds = [];
            for (var rowIndex = 0; rowIndex < this.adapter_.getRowCount(); rowIndex++) {
                if (this.adapter_.isCheckboxAtRowIndexChecked(rowIndex)) {
                    selectedRowIds.push(this.adapter_.getRowIdAtIndex(rowIndex));
                }
            }
            return selectedRowIds;
        };
        /**
         * Handles header row checkbox change event.
         */
        MDCDataTableFoundation.prototype.handleHeaderRowCheckboxChange = function () {
            var isHeaderChecked = this.adapter_.isHeaderRowCheckboxChecked();
            for (var rowIndex = 0; rowIndex < this.adapter_.getRowCount(); rowIndex++) {
                this.adapter_.setRowCheckboxCheckedAtIndex(rowIndex, isHeaderChecked);
                this.selectRowAtIndex_(rowIndex, isHeaderChecked);
            }
            if (isHeaderChecked) {
                this.adapter_.notifySelectedAll();
            }
            else {
                this.adapter_.notifyUnselectedAll();
            }
        };
        /**
         * Handles change event originated from row checkboxes.
         */
        MDCDataTableFoundation.prototype.handleRowCheckboxChange = function (event) {
            var rowIndex = this.adapter_.getRowIndexByChildElement(event.target);
            if (rowIndex === -1) {
                return;
            }
            var selected = this.adapter_.isCheckboxAtRowIndexChecked(rowIndex);
            this.selectRowAtIndex_(rowIndex, selected);
            this.setHeaderRowCheckboxState_();
            var rowId = this.adapter_.getRowIdAtIndex(rowIndex);
            this.adapter_.notifyRowSelectionChanged({ rowId: rowId, rowIndex: rowIndex, selected: selected });
        };
        /**
         * Updates header row checkbox state based on number of rows selected.
         */
        MDCDataTableFoundation.prototype.setHeaderRowCheckboxState_ = function () {
            if (this.adapter_.getSelectedRowCount() === this.adapter_.getRowCount()) {
                this.adapter_.setHeaderRowCheckboxChecked(true);
                this.adapter_.setHeaderRowCheckboxIndeterminate(false);
            }
            else if (this.adapter_.getSelectedRowCount() === 0) {
                this.adapter_.setHeaderRowCheckboxIndeterminate(false);
                this.adapter_.setHeaderRowCheckboxChecked(false);
            }
            else {
                this.adapter_.setHeaderRowCheckboxIndeterminate(true);
                this.adapter_.setHeaderRowCheckboxChecked(false);
            }
        };
        /**
         * Sets the attributes of row element based on selection state.
         */
        MDCDataTableFoundation.prototype.selectRowAtIndex_ = function (rowIndex, selected) {
            if (selected) {
                this.adapter_.addClassAtRowIndex(rowIndex, cssClasses$a.ROW_SELECTED);
                this.adapter_.setAttributeAtRowIndex(rowIndex, strings$8.ARIA_SELECTED, 'true');
            }
            else {
                this.adapter_.removeClassAtRowIndex(rowIndex, cssClasses$a.ROW_SELECTED);
                this.adapter_.setAttributeAtRowIndex(rowIndex, strings$8.ARIA_SELECTED, 'false');
            }
        };
        return MDCDataTableFoundation;
    }(MDCFoundation));

    /**
     * @license
     * Copyright 2019 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var MDCDataTable = /** @class */ (function (_super) {
        __extends(MDCDataTable, _super);
        function MDCDataTable() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        MDCDataTable.attachTo = function (root) {
            return new MDCDataTable(root);
        };
        MDCDataTable.prototype.initialize = function (checkboxFactory) {
            if (checkboxFactory === void 0) { checkboxFactory = function (el) { return new MDCCheckbox(el); }; }
            this.checkboxFactory_ = checkboxFactory;
        };
        MDCDataTable.prototype.initialSyncWithDOM = function () {
            var _this = this;
            this.headerRow_ = this.root_.querySelector("." + cssClasses$a.HEADER_ROW);
            this.handleHeaderRowCheckboxChange_ = function () { return _this.foundation_.handleHeaderRowCheckboxChange(); };
            this.headerRow_.addEventListener('change', this.handleHeaderRowCheckboxChange_);
            this.content_ = this.root_.querySelector("." + cssClasses$a.CONTENT);
            this.handleRowCheckboxChange_ = function (event) { return _this.foundation_.handleRowCheckboxChange(event); };
            this.content_.addEventListener('change', this.handleRowCheckboxChange_);
            this.layout();
        };
        /**
         * Re-initializes header row checkbox and row checkboxes when selectable rows are added or removed from table.
         */
        MDCDataTable.prototype.layout = function () {
            this.foundation_.layout();
        };
        /**
         * @return Returns array of row elements.
         */
        MDCDataTable.prototype.getRows = function () {
            return this.foundation_.getRows();
        };
        /**
         * @return Returns array of selected row ids.
         */
        MDCDataTable.prototype.getSelectedRowIds = function () {
            return this.foundation_.getSelectedRowIds();
        };
        /**
         * Sets selected row ids. Overwrites previously selected rows.
         * @param rowIds Array of row ids that needs to be selected.
         */
        MDCDataTable.prototype.setSelectedRowIds = function (rowIds) {
            this.foundation_.setSelectedRowIds(rowIds);
        };
        MDCDataTable.prototype.destroy = function () {
            this.headerRow_.removeEventListener('change', this.handleHeaderRowCheckboxChange_);
            this.content_.removeEventListener('change', this.handleRowCheckboxChange_);
            this.headerRowCheckbox_.destroy();
            this.rowCheckboxList_.forEach(function (checkbox) { return checkbox.destroy(); });
        };
        MDCDataTable.prototype.getDefaultFoundation = function () {
            var _this = this;
            // DO NOT INLINE this variable. For backward compatibility, foundations take a Partial<MDCFooAdapter>.
            // To ensure we don't accidentally omit any methods, we need a separate, strongly typed adapter variable.
            // tslint:disable:object-literal-sort-keys Methods should be in the same order as the adapter interface.
            var adapter = {
                addClassAtRowIndex: function (rowIndex, className) { return _this.getRows()[rowIndex].classList.add(className); },
                getRowCount: function () { return _this.getRows().length; },
                getRowElements: function () { return [].slice.call(_this.root_.querySelectorAll(strings$8.ROW_SELECTOR)); },
                getRowIdAtIndex: function (rowIndex) { return _this.getRows()[rowIndex].getAttribute(strings$8.DATA_ROW_ID_ATTR); },
                getRowIndexByChildElement: function (el) {
                    return _this.getRows().indexOf(closest(el, strings$8.ROW_SELECTOR));
                },
                getSelectedRowCount: function () { return _this.root_.querySelectorAll(strings$8.ROW_SELECTED_SELECTOR).length; },
                isCheckboxAtRowIndexChecked: function (rowIndex) { return _this.rowCheckboxList_[rowIndex].checked; },
                isHeaderRowCheckboxChecked: function () { return _this.headerRowCheckbox_.checked; },
                isRowsSelectable: function () { return !!_this.root_.querySelector(strings$8.ROW_CHECKBOX_SELECTOR); },
                notifyRowSelectionChanged: function (data) {
                    _this.emit(events.ROW_SELECTION_CHANGED, {
                        row: _this.getRowByIndex_(data.rowIndex),
                        rowId: _this.getRowIdByIndex_(data.rowIndex),
                        rowIndex: data.rowIndex,
                        selected: data.selected,
                    }, 
                    /** shouldBubble */ true);
                },
                notifySelectedAll: function () { return _this.emit(events.SELECTED_ALL, {}, /** shouldBubble */ true); },
                notifyUnselectedAll: function () { return _this.emit(events.UNSELECTED_ALL, {}, /** shouldBubble */ true); },
                registerHeaderRowCheckbox: function () {
                    if (_this.headerRowCheckbox_) {
                        _this.headerRowCheckbox_.destroy();
                    }
                    var checkboxEl = _this.root_.querySelector(strings$8.HEADER_ROW_CHECKBOX_SELECTOR);
                    _this.headerRowCheckbox_ = _this.checkboxFactory_(checkboxEl);
                },
                registerRowCheckboxes: function () {
                    if (_this.rowCheckboxList_) {
                        _this.rowCheckboxList_.forEach(function (checkbox) { return checkbox.destroy(); });
                    }
                    _this.rowCheckboxList_ = [];
                    _this.getRows().forEach(function (rowEl) {
                        var checkbox = _this.checkboxFactory_(rowEl.querySelector(strings$8.ROW_CHECKBOX_SELECTOR));
                        _this.rowCheckboxList_.push(checkbox);
                    });
                },
                removeClassAtRowIndex: function (rowIndex, className) {
                    _this.getRows()[rowIndex].classList.remove(className);
                },
                setAttributeAtRowIndex: function (rowIndex, attr, value) {
                    _this.getRows()[rowIndex].setAttribute(attr, value);
                },
                setHeaderRowCheckboxChecked: function (checked) {
                    _this.headerRowCheckbox_.checked = checked;
                },
                setHeaderRowCheckboxIndeterminate: function (indeterminate) {
                    _this.headerRowCheckbox_.indeterminate = indeterminate;
                },
                setRowCheckboxCheckedAtIndex: function (rowIndex, checked) {
                    _this.rowCheckboxList_[rowIndex].checked = checked;
                },
            };
            return new MDCDataTableFoundation(adapter);
        };
        MDCDataTable.prototype.getRowByIndex_ = function (index) {
            return this.getRows()[index];
        };
        MDCDataTable.prototype.getRowIdByIndex_ = function (index) {
            return this.getRowByIndex_(index).getAttribute(strings$8.DATA_ROW_ID_ATTR);
        };
        return MDCDataTable;
    }(MDCComponent));

    /* node_modules/@smui/data-table/DataTable.svelte generated by Svelte v3.19.1 */

    function create_fragment$d(ctx) {
    	let div;
    	let table;
    	let useActions_action;
    	let useActions_action_1;
    	let forwardEvents_action;
    	let current;
    	let dispose;
    	const default_slot_template = /*$$slots*/ ctx[23].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[22], null);

    	let table_levels = [
    		{
    			class: "mdc-data-table__table " + /*table$class*/ ctx[3]
    		},
    		prefixFilter(/*$$props*/ ctx[7], "table$")
    	];

    	let table_data = {};

    	for (let i = 0; i < table_levels.length; i += 1) {
    		table_data = assign(table_data, table_levels[i]);
    	}

    	let div_levels = [
    		{
    			class: "mdc-data-table " + /*className*/ ctx[1]
    		},
    		exclude(/*$$props*/ ctx[7], ["use", "class", "table$"])
    	];

    	let div_data = {};

    	for (let i = 0; i < div_levels.length; i += 1) {
    		div_data = assign(div_data, div_levels[i]);
    	}

    	return {
    		c() {
    			div = element("div");
    			table = element("table");
    			if (default_slot) default_slot.c();
    			set_attributes(table, table_data);
    			set_attributes(div, div_data);
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, table);

    			if (default_slot) {
    				default_slot.m(table, null);
    			}

    			/*div_binding*/ ctx[24](div);
    			current = true;

    			dispose = [
    				action_destroyer(useActions_action = useActions.call(null, table, /*table$use*/ ctx[2])),
    				action_destroyer(useActions_action_1 = useActions.call(null, div, /*use*/ ctx[0])),
    				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[5].call(null, div)),
    				listen(div, "MDCDataTable:rowSelectionChanged", /*handleChange*/ ctx[6]),
    				listen(div, "MDCDataTable:selectedAll", /*handleChange*/ ctx[6]),
    				listen(div, "MDCDataTable:unselectedAll", /*handleChange*/ ctx[6])
    			];
    		},
    		p(ctx, [dirty]) {
    			if (default_slot && default_slot.p && dirty & /*$$scope*/ 4194304) {
    				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[22], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[22], dirty, null));
    			}

    			set_attributes(table, get_spread_update(table_levels, [
    				dirty & /*table$class*/ 8 && {
    					class: "mdc-data-table__table " + /*table$class*/ ctx[3]
    				},
    				dirty & /*prefixFilter, $$props*/ 128 && prefixFilter(/*$$props*/ ctx[7], "table$")
    			]));

    			if (useActions_action && is_function(useActions_action.update) && dirty & /*table$use*/ 4) useActions_action.update.call(null, /*table$use*/ ctx[2]);

    			set_attributes(div, get_spread_update(div_levels, [
    				dirty & /*className*/ 2 && {
    					class: "mdc-data-table " + /*className*/ ctx[1]
    				},
    				dirty & /*exclude, $$props*/ 128 && exclude(/*$$props*/ ctx[7], ["use", "class", "table$"])
    			]));

    			if (useActions_action_1 && is_function(useActions_action_1.update) && dirty & /*use*/ 1) useActions_action_1.update.call(null, /*use*/ ctx[0]);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (default_slot) default_slot.d(detaching);
    			/*div_binding*/ ctx[24](null);
    			run_all(dispose);
    		}
    	};
    }

    function instance$d($$self, $$props, $$invalidate) {

    	const forwardEvents = forwardEventsBuilder(current_component, [
    		"MDCDataTable:rowSelectionChanged",
    		"MDCDataTable:selectedAll",
    		"MDCDataTable:unselectedAll"
    	]);

    	let { use = [] } = $$props;
    	let { class: className = "" } = $$props;
    	let { table$use = [] } = $$props;
    	let { table$class = "" } = $$props;
    	let element;
    	let dataTable;
    	let changeHandlers = [];
    	let checkBoxHeaderPromiseResolve;
    	let checkBoxHeaderPromise = new Promise(resolve => checkBoxHeaderPromiseResolve = resolve);
    	let checkBoxListPromiseResolve;
    	let checkBoxListPromise = new Promise(resolve => checkBoxListPromiseResolve = resolve);
    	let addLayoutListener = getContext("SMUI:addLayoutListener");
    	let removeLayoutListener;
    	setContext("SMUI:generic:input:addChangeHandler", addChangeHandler);
    	setContext("SMUI:checkbox:context", "data-table");
    	setContext("SMUI:checkbox:instantiate", false);
    	setContext("SMUI:checkbox:getInstance", getCheckboxInstancePromise);

    	if (addLayoutListener) {
    		removeLayoutListener = addLayoutListener(layout);
    	}

    	onMount(async () => {
    		dataTable = new MDCDataTable(element);
    		checkBoxHeaderPromiseResolve(dataTable.headerRowCheckbox_);
    		checkBoxListPromiseResolve(dataTable.rowCheckboxList_);

    		// Workaround for a bug in MDC DataTable where a table with no checkboxes
    		// calls destroy on them anyway.
    		if (!dataTable.headerRowCheckbox_) {
    			dataTable.headerRowCheckbox_ = {
    				destroy() {
    					
    				}
    			};
    		}

    		if (!dataTable.rowCheckboxList_) {
    			dataTable.rowCheckboxList_ = [];
    		}
    	});

    	onDestroy(() => {
    		dataTable && dataTable.destroy();

    		if (removeLayoutListener) {
    			removeLayoutListener();
    		}
    	});

    	function getCheckboxInstancePromise(header) {
    		return header ? checkBoxHeaderPromise : checkBoxListPromise;
    	}

    	function handleChange() {
    		for (let i = 0; i < changeHandlers.length; i++) {
    			changeHandlers[i]();
    		}
    	}

    	function addChangeHandler(handler) {
    		changeHandlers.push(handler);
    	}

    	function layout(...args) {
    		return dataTable.layout(...args);
    	}

    	function getRows(...args) {
    		return dataTable.getRows(...args);
    	}

    	function getSelectedRowIds(...args) {
    		return dataTable.getSelectedRowIds(...args);
    	}

    	function setSelectedRowIds(...args) {
    		return dataTable.setSelectedRowIds(...args);
    	}

    	let { $$slots = {}, $$scope } = $$props;

    	function div_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(4, element = $$value);
    		});
    	}

    	$$self.$set = $$new_props => {
    		$$invalidate(7, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		if ("use" in $$new_props) $$invalidate(0, use = $$new_props.use);
    		if ("class" in $$new_props) $$invalidate(1, className = $$new_props.class);
    		if ("table$use" in $$new_props) $$invalidate(2, table$use = $$new_props.table$use);
    		if ("table$class" in $$new_props) $$invalidate(3, table$class = $$new_props.table$class);
    		if ("$$scope" in $$new_props) $$invalidate(22, $$scope = $$new_props.$$scope);
    	};

    	$$props = exclude_internal_props($$props);

    	return [
    		use,
    		className,
    		table$use,
    		table$class,
    		element,
    		forwardEvents,
    		handleChange,
    		$$props,
    		layout,
    		getRows,
    		getSelectedRowIds,
    		setSelectedRowIds,
    		dataTable,
    		checkBoxHeaderPromiseResolve,
    		checkBoxListPromiseResolve,
    		removeLayoutListener,
    		changeHandlers,
    		checkBoxHeaderPromise,
    		checkBoxListPromise,
    		addLayoutListener,
    		getCheckboxInstancePromise,
    		addChangeHandler,
    		$$scope,
    		$$slots,
    		div_binding
    	];
    }

    class DataTable extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$d, create_fragment$d, safe_not_equal, {
    			use: 0,
    			class: 1,
    			table$use: 2,
    			table$class: 3,
    			layout: 8,
    			getRows: 9,
    			getSelectedRowIds: 10,
    			setSelectedRowIds: 11
    		});
    	}

    	get layout() {
    		return this.$$.ctx[8];
    	}

    	get getRows() {
    		return this.$$.ctx[9];
    	}

    	get getSelectedRowIds() {
    		return this.$$.ctx[10];
    	}

    	get setSelectedRowIds() {
    		return this.$$.ctx[11];
    	}
    }

    /* node_modules/@smui/data-table/Head.svelte generated by Svelte v3.19.1 */

    function create_fragment$e(ctx) {
    	let thead;
    	let useActions_action;
    	let forwardEvents_action;
    	let current;
    	let dispose;
    	const default_slot_template = /*$$slots*/ ctx[4].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[3], null);
    	let thead_levels = [exclude(/*$$props*/ ctx[2], ["use"])];
    	let thead_data = {};

    	for (let i = 0; i < thead_levels.length; i += 1) {
    		thead_data = assign(thead_data, thead_levels[i]);
    	}

    	return {
    		c() {
    			thead = element("thead");
    			if (default_slot) default_slot.c();
    			set_attributes(thead, thead_data);
    		},
    		m(target, anchor) {
    			insert(target, thead, anchor);

    			if (default_slot) {
    				default_slot.m(thead, null);
    			}

    			current = true;

    			dispose = [
    				action_destroyer(useActions_action = useActions.call(null, thead, /*use*/ ctx[0])),
    				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[1].call(null, thead))
    			];
    		},
    		p(ctx, [dirty]) {
    			if (default_slot && default_slot.p && dirty & /*$$scope*/ 8) {
    				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[3], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[3], dirty, null));
    			}

    			set_attributes(thead, get_spread_update(thead_levels, [dirty & /*exclude, $$props*/ 4 && exclude(/*$$props*/ ctx[2], ["use"])]));
    			if (useActions_action && is_function(useActions_action.update) && dirty & /*use*/ 1) useActions_action.update.call(null, /*use*/ ctx[0]);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(thead);
    			if (default_slot) default_slot.d(detaching);
    			run_all(dispose);
    		}
    	};
    }

    function instance$e($$self, $$props, $$invalidate) {
    	const forwardEvents = forwardEventsBuilder(current_component);
    	let { use = [] } = $$props;
    	setContext("SMUI:data-table:row:header", true);
    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$set = $$new_props => {
    		$$invalidate(2, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		if ("use" in $$new_props) $$invalidate(0, use = $$new_props.use);
    		if ("$$scope" in $$new_props) $$invalidate(3, $$scope = $$new_props.$$scope);
    	};

    	$$props = exclude_internal_props($$props);
    	return [use, forwardEvents, $$props, $$scope, $$slots];
    }

    class Head extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$e, create_fragment$e, safe_not_equal, { use: 0 });
    	}
    }

    /* node_modules/@smui/data-table/Body.svelte generated by Svelte v3.19.1 */

    function create_fragment$f(ctx) {
    	let tbody;
    	let useActions_action;
    	let forwardEvents_action;
    	let current;
    	let dispose;
    	const default_slot_template = /*$$slots*/ ctx[5].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[4], null);

    	let tbody_levels = [
    		{
    			class: "mdc-data-table__content " + /*className*/ ctx[1]
    		},
    		exclude(/*$$props*/ ctx[3], ["use", "class"])
    	];

    	let tbody_data = {};

    	for (let i = 0; i < tbody_levels.length; i += 1) {
    		tbody_data = assign(tbody_data, tbody_levels[i]);
    	}

    	return {
    		c() {
    			tbody = element("tbody");
    			if (default_slot) default_slot.c();
    			set_attributes(tbody, tbody_data);
    		},
    		m(target, anchor) {
    			insert(target, tbody, anchor);

    			if (default_slot) {
    				default_slot.m(tbody, null);
    			}

    			current = true;

    			dispose = [
    				action_destroyer(useActions_action = useActions.call(null, tbody, /*use*/ ctx[0])),
    				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[2].call(null, tbody))
    			];
    		},
    		p(ctx, [dirty]) {
    			if (default_slot && default_slot.p && dirty & /*$$scope*/ 16) {
    				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[4], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[4], dirty, null));
    			}

    			set_attributes(tbody, get_spread_update(tbody_levels, [
    				dirty & /*className*/ 2 && {
    					class: "mdc-data-table__content " + /*className*/ ctx[1]
    				},
    				dirty & /*exclude, $$props*/ 8 && exclude(/*$$props*/ ctx[3], ["use", "class"])
    			]));

    			if (useActions_action && is_function(useActions_action.update) && dirty & /*use*/ 1) useActions_action.update.call(null, /*use*/ ctx[0]);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(tbody);
    			if (default_slot) default_slot.d(detaching);
    			run_all(dispose);
    		}
    	};
    }

    function instance$f($$self, $$props, $$invalidate) {
    	const forwardEvents = forwardEventsBuilder(current_component);
    	let { use = [] } = $$props;
    	let { class: className = "" } = $$props;
    	setContext("SMUI:data-table:row:header", false);
    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$set = $$new_props => {
    		$$invalidate(3, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		if ("use" in $$new_props) $$invalidate(0, use = $$new_props.use);
    		if ("class" in $$new_props) $$invalidate(1, className = $$new_props.class);
    		if ("$$scope" in $$new_props) $$invalidate(4, $$scope = $$new_props.$$scope);
    	};

    	$$props = exclude_internal_props($$props);
    	return [use, className, forwardEvents, $$props, $$scope, $$slots];
    }

    class Body extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$f, create_fragment$f, safe_not_equal, { use: 0, class: 1 });
    	}
    }

    /* node_modules/@smui/data-table/Row.svelte generated by Svelte v3.19.1 */

    function create_fragment$g(ctx) {
    	let tr;
    	let useActions_action;
    	let forwardEvents_action;
    	let current;
    	let dispose;
    	const default_slot_template = /*$$slots*/ ctx[10].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[9], null);

    	let tr_levels = [
    		{
    			class: "\n    " + /*className*/ ctx[1] + "\n    " + (/*header*/ ctx[5] ? "mdc-data-table__header-row" : "") + "\n    " + (!/*header*/ ctx[5] ? "mdc-data-table__row" : "") + "\n    " + (!/*header*/ ctx[5] && /*selected*/ ctx[3]
    			? "mdc-data-table__row--selected"
    			: "") + "\n  "
    		},
    		/*selected*/ ctx[3] !== undefined
    		? {
    				"aria-selected": /*selected*/ ctx[3] ? "true" : "false"
    			}
    		: {},
    		exclude(/*$$props*/ ctx[6], ["use", "class"])
    	];

    	let tr_data = {};

    	for (let i = 0; i < tr_levels.length; i += 1) {
    		tr_data = assign(tr_data, tr_levels[i]);
    	}

    	return {
    		c() {
    			tr = element("tr");
    			if (default_slot) default_slot.c();
    			set_attributes(tr, tr_data);
    		},
    		m(target, anchor) {
    			insert(target, tr, anchor);

    			if (default_slot) {
    				default_slot.m(tr, null);
    			}

    			/*tr_binding*/ ctx[11](tr);
    			current = true;

    			dispose = [
    				action_destroyer(useActions_action = useActions.call(null, tr, /*use*/ ctx[0])),
    				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[4].call(null, tr))
    			];
    		},
    		p(ctx, [dirty]) {
    			if (default_slot && default_slot.p && dirty & /*$$scope*/ 512) {
    				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[9], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[9], dirty, null));
    			}

    			set_attributes(tr, get_spread_update(tr_levels, [
    				dirty & /*className, header, selected*/ 42 && {
    					class: "\n    " + /*className*/ ctx[1] + "\n    " + (/*header*/ ctx[5] ? "mdc-data-table__header-row" : "") + "\n    " + (!/*header*/ ctx[5] ? "mdc-data-table__row" : "") + "\n    " + (!/*header*/ ctx[5] && /*selected*/ ctx[3]
    					? "mdc-data-table__row--selected"
    					: "") + "\n  "
    				},
    				dirty & /*selected, undefined*/ 8 && (/*selected*/ ctx[3] !== undefined
    				? {
    						"aria-selected": /*selected*/ ctx[3] ? "true" : "false"
    					}
    				: {}),
    				dirty & /*exclude, $$props*/ 64 && exclude(/*$$props*/ ctx[6], ["use", "class"])
    			]));

    			if (useActions_action && is_function(useActions_action.update) && dirty & /*use*/ 1) useActions_action.update.call(null, /*use*/ ctx[0]);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(tr);
    			if (default_slot) default_slot.d(detaching);
    			/*tr_binding*/ ctx[11](null);
    			run_all(dispose);
    		}
    	};
    }

    function instance$g($$self, $$props, $$invalidate) {
    	const forwardEvents = forwardEventsBuilder(current_component);
    	let { use = [] } = $$props;
    	let { class: className = "" } = $$props;
    	let element;
    	let header = getContext("SMUI:data-table:row:header");
    	let selected = undefined;
    	setContext("SMUI:data-table:row:getIndex", getIndex);
    	setContext("SMUI:generic:input:setChecked", setChecked);

    	function setChecked(checked) {
    		$$invalidate(3, selected = checked);
    	}

    	function getIndex() {
    		let i = 0;

    		if (element) {
    			let el = element;

    			while (el.previousSibling) {
    				el = el.previousSibling;

    				if (el.nodeType === 1) {
    					i++;
    				}
    			}
    		}

    		return i;
    	}

    	let { $$slots = {}, $$scope } = $$props;

    	function tr_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(2, element = $$value);
    		});
    	}

    	$$self.$set = $$new_props => {
    		$$invalidate(6, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		if ("use" in $$new_props) $$invalidate(0, use = $$new_props.use);
    		if ("class" in $$new_props) $$invalidate(1, className = $$new_props.class);
    		if ("$$scope" in $$new_props) $$invalidate(9, $$scope = $$new_props.$$scope);
    	};

    	$$props = exclude_internal_props($$props);

    	return [
    		use,
    		className,
    		element,
    		selected,
    		forwardEvents,
    		header,
    		$$props,
    		setChecked,
    		getIndex,
    		$$scope,
    		$$slots,
    		tr_binding
    	];
    }

    class Row extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$g, create_fragment$g, safe_not_equal, { use: 0, class: 1 });
    	}
    }

    /* node_modules/@smui/data-table/Cell.svelte generated by Svelte v3.19.1 */

    function create_else_block$3(ctx) {
    	let td;
    	let useActions_action;
    	let forwardEvents_action;
    	let current;
    	let dispose;
    	const default_slot_template = /*$$slots*/ ctx[13].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[12], null);

    	let td_levels = [
    		{
    			class: "\n      mdc-data-table__cell\n      " + /*className*/ ctx[1] + "\n      " + (/*numeric*/ ctx[2]
    			? "mdc-data-table__cell--numeric"
    			: "") + "\n      " + (/*checkbox*/ ctx[3]
    			? "mdc-data-table__cell--checkbox"
    			: "") + "\n    "
    		},
    		/*roleProp*/ ctx[5],
    		/*scopeProp*/ ctx[6],
    		/*props*/ ctx[4]
    	];

    	let td_data = {};

    	for (let i = 0; i < td_levels.length; i += 1) {
    		td_data = assign(td_data, td_levels[i]);
    	}

    	return {
    		c() {
    			td = element("td");
    			if (default_slot) default_slot.c();
    			set_attributes(td, td_data);
    		},
    		m(target, anchor) {
    			insert(target, td, anchor);

    			if (default_slot) {
    				default_slot.m(td, null);
    			}

    			current = true;

    			dispose = [
    				action_destroyer(useActions_action = useActions.call(null, td, /*use*/ ctx[0])),
    				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[7].call(null, td))
    			];
    		},
    		p(ctx, dirty) {
    			if (default_slot && default_slot.p && dirty & /*$$scope*/ 4096) {
    				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[12], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[12], dirty, null));
    			}

    			set_attributes(td, get_spread_update(td_levels, [
    				dirty & /*className, numeric, checkbox*/ 14 && {
    					class: "\n      mdc-data-table__cell\n      " + /*className*/ ctx[1] + "\n      " + (/*numeric*/ ctx[2]
    					? "mdc-data-table__cell--numeric"
    					: "") + "\n      " + (/*checkbox*/ ctx[3]
    					? "mdc-data-table__cell--checkbox"
    					: "") + "\n    "
    				},
    				dirty & /*roleProp*/ 32 && /*roleProp*/ ctx[5],
    				dirty & /*scopeProp*/ 64 && /*scopeProp*/ ctx[6],
    				dirty & /*props*/ 16 && /*props*/ ctx[4]
    			]));

    			if (useActions_action && is_function(useActions_action.update) && dirty & /*use*/ 1) useActions_action.update.call(null, /*use*/ ctx[0]);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(td);
    			if (default_slot) default_slot.d(detaching);
    			run_all(dispose);
    		}
    	};
    }

    // (1:0) {#if header}
    function create_if_block$5(ctx) {
    	let th;
    	let useActions_action;
    	let forwardEvents_action;
    	let current;
    	let dispose;
    	const default_slot_template = /*$$slots*/ ctx[13].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[12], null);

    	let th_levels = [
    		{
    			class: "\n      mdc-data-table__header-cell\n      " + /*className*/ ctx[1] + "\n      " + (/*checkbox*/ ctx[3]
    			? "mdc-data-table__header-cell--checkbox"
    			: "") + "\n    "
    		},
    		/*roleProp*/ ctx[5],
    		/*scopeProp*/ ctx[6],
    		/*props*/ ctx[4]
    	];

    	let th_data = {};

    	for (let i = 0; i < th_levels.length; i += 1) {
    		th_data = assign(th_data, th_levels[i]);
    	}

    	return {
    		c() {
    			th = element("th");
    			if (default_slot) default_slot.c();
    			set_attributes(th, th_data);
    		},
    		m(target, anchor) {
    			insert(target, th, anchor);

    			if (default_slot) {
    				default_slot.m(th, null);
    			}

    			current = true;

    			dispose = [
    				action_destroyer(useActions_action = useActions.call(null, th, /*use*/ ctx[0])),
    				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[7].call(null, th))
    			];
    		},
    		p(ctx, dirty) {
    			if (default_slot && default_slot.p && dirty & /*$$scope*/ 4096) {
    				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[12], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[12], dirty, null));
    			}

    			set_attributes(th, get_spread_update(th_levels, [
    				dirty & /*className, checkbox*/ 10 && {
    					class: "\n      mdc-data-table__header-cell\n      " + /*className*/ ctx[1] + "\n      " + (/*checkbox*/ ctx[3]
    					? "mdc-data-table__header-cell--checkbox"
    					: "") + "\n    "
    				},
    				dirty & /*roleProp*/ 32 && /*roleProp*/ ctx[5],
    				dirty & /*scopeProp*/ 64 && /*scopeProp*/ ctx[6],
    				dirty & /*props*/ 16 && /*props*/ ctx[4]
    			]));

    			if (useActions_action && is_function(useActions_action.update) && dirty & /*use*/ 1) useActions_action.update.call(null, /*use*/ ctx[0]);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(th);
    			if (default_slot) default_slot.d(detaching);
    			run_all(dispose);
    		}
    	};
    }

    function create_fragment$h(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block$5, create_else_block$3];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*header*/ ctx[8]) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	return {
    		c() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if_block.p(ctx, dirty);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function instance$h($$self, $$props, $$invalidate) {
    	const forwardEvents = forwardEventsBuilder(current_component);
    	let header = getContext("SMUI:data-table:row:header");
    	let { use = [] } = $$props;
    	let { class: className = "" } = $$props;
    	let { role = header ? "columnheader" : undefined } = $$props;
    	let { scope = header ? "col" : undefined } = $$props;
    	let { numeric = false } = $$props;
    	let { checkbox = false } = $$props;
    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$set = $$new_props => {
    		$$invalidate(11, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		if ("use" in $$new_props) $$invalidate(0, use = $$new_props.use);
    		if ("class" in $$new_props) $$invalidate(1, className = $$new_props.class);
    		if ("role" in $$new_props) $$invalidate(9, role = $$new_props.role);
    		if ("scope" in $$new_props) $$invalidate(10, scope = $$new_props.scope);
    		if ("numeric" in $$new_props) $$invalidate(2, numeric = $$new_props.numeric);
    		if ("checkbox" in $$new_props) $$invalidate(3, checkbox = $$new_props.checkbox);
    		if ("$$scope" in $$new_props) $$invalidate(12, $$scope = $$new_props.$$scope);
    	};

    	let props;
    	let roleProp;
    	let scopeProp;

    	$$self.$$.update = () => {
    		 $$invalidate(4, props = exclude($$props, ["use", "class", "numeric", "checkbox"]));

    		if ($$self.$$.dirty & /*role*/ 512) {
    			 $$invalidate(5, roleProp = role ? { role } : {});
    		}

    		if ($$self.$$.dirty & /*scope*/ 1024) {
    			 $$invalidate(6, scopeProp = scope ? { scope } : {});
    		}
    	};

    	$$props = exclude_internal_props($$props);

    	return [
    		use,
    		className,
    		numeric,
    		checkbox,
    		props,
    		roleProp,
    		scopeProp,
    		forwardEvents,
    		header,
    		role,
    		scope,
    		$$props,
    		$$scope,
    		$$slots
    	];
    }

    class Cell extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$h, create_fragment$h, safe_not_equal, {
    			use: 0,
    			class: 1,
    			role: 9,
    			scope: 10,
    			numeric: 2,
    			checkbox: 3
    		});
    	}
    }

    /**
     * @license
     * Copyright 2018 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    /** CSS classes used by the switch. */
    var cssClasses$b = {
        /** Class used for a switch that is in the "checked" (on) position. */
        CHECKED: 'mdc-switch--checked',
        /** Class used for a switch that is disabled. */
        DISABLED: 'mdc-switch--disabled',
    };
    /** String constants used by the switch. */
    var strings$9 = {
        /** A CSS selector used to locate the native HTML control for the switch.  */
        NATIVE_CONTROL_SELECTOR: '.mdc-switch__native-control',
        /** A CSS selector used to locate the ripple surface element for the switch. */
        RIPPLE_SURFACE_SELECTOR: '.mdc-switch__thumb-underlay',
    };

    /**
     * @license
     * Copyright 2018 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var MDCSwitchFoundation = /** @class */ (function (_super) {
        __extends(MDCSwitchFoundation, _super);
        function MDCSwitchFoundation(adapter) {
            return _super.call(this, __assign({}, MDCSwitchFoundation.defaultAdapter, adapter)) || this;
        }
        Object.defineProperty(MDCSwitchFoundation, "strings", {
            /** The string constants used by the switch. */
            get: function () {
                return strings$9;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCSwitchFoundation, "cssClasses", {
            /** The CSS classes used by the switch. */
            get: function () {
                return cssClasses$b;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCSwitchFoundation, "defaultAdapter", {
            /** The default Adapter for the switch. */
            get: function () {
                return {
                    addClass: function () { return undefined; },
                    removeClass: function () { return undefined; },
                    setNativeControlChecked: function () { return undefined; },
                    setNativeControlDisabled: function () { return undefined; },
                };
            },
            enumerable: true,
            configurable: true
        });
        /** Sets the checked state of the switch. */
        MDCSwitchFoundation.prototype.setChecked = function (checked) {
            this.adapter_.setNativeControlChecked(checked);
            this.updateCheckedStyling_(checked);
        };
        /** Sets the disabled state of the switch. */
        MDCSwitchFoundation.prototype.setDisabled = function (disabled) {
            this.adapter_.setNativeControlDisabled(disabled);
            if (disabled) {
                this.adapter_.addClass(cssClasses$b.DISABLED);
            }
            else {
                this.adapter_.removeClass(cssClasses$b.DISABLED);
            }
        };
        /** Handles the change event for the switch native control. */
        MDCSwitchFoundation.prototype.handleChange = function (evt) {
            var nativeControl = evt.target;
            this.updateCheckedStyling_(nativeControl.checked);
        };
        /** Updates the styling of the switch based on its checked state. */
        MDCSwitchFoundation.prototype.updateCheckedStyling_ = function (checked) {
            if (checked) {
                this.adapter_.addClass(cssClasses$b.CHECKED);
            }
            else {
                this.adapter_.removeClass(cssClasses$b.CHECKED);
            }
        };
        return MDCSwitchFoundation;
    }(MDCFoundation));

    /**
     * @license
     * Copyright 2018 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var MDCSwitch = /** @class */ (function (_super) {
        __extends(MDCSwitch, _super);
        function MDCSwitch() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.ripple_ = _this.createRipple_();
            return _this;
        }
        MDCSwitch.attachTo = function (root) {
            return new MDCSwitch(root);
        };
        MDCSwitch.prototype.destroy = function () {
            _super.prototype.destroy.call(this);
            this.ripple_.destroy();
            this.nativeControl_.removeEventListener('change', this.changeHandler_);
        };
        MDCSwitch.prototype.initialSyncWithDOM = function () {
            var _this = this;
            this.changeHandler_ = function () {
                var _a;
                var args = [];
                for (var _i = 0; _i < arguments.length; _i++) {
                    args[_i] = arguments[_i];
                }
                return (_a = _this.foundation_).handleChange.apply(_a, __spread(args));
            };
            this.nativeControl_.addEventListener('change', this.changeHandler_);
            // Sometimes the checked state of the input element is saved in the history.
            // The switch styling should match the checked state of the input element.
            // Do an initial sync between the native control and the foundation.
            this.checked = this.checked;
        };
        MDCSwitch.prototype.getDefaultFoundation = function () {
            var _this = this;
            // DO NOT INLINE this variable. For backward compatibility, foundations take a Partial<MDCFooAdapter>.
            // To ensure we don't accidentally omit any methods, we need a separate, strongly typed adapter variable.
            var adapter = {
                addClass: function (className) { return _this.root_.classList.add(className); },
                removeClass: function (className) { return _this.root_.classList.remove(className); },
                setNativeControlChecked: function (checked) { return _this.nativeControl_.checked = checked; },
                setNativeControlDisabled: function (disabled) { return _this.nativeControl_.disabled = disabled; },
            };
            return new MDCSwitchFoundation(adapter);
        };
        Object.defineProperty(MDCSwitch.prototype, "ripple", {
            get: function () {
                return this.ripple_;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCSwitch.prototype, "checked", {
            get: function () {
                return this.nativeControl_.checked;
            },
            set: function (checked) {
                this.foundation_.setChecked(checked);
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCSwitch.prototype, "disabled", {
            get: function () {
                return this.nativeControl_.disabled;
            },
            set: function (disabled) {
                this.foundation_.setDisabled(disabled);
            },
            enumerable: true,
            configurable: true
        });
        MDCSwitch.prototype.createRipple_ = function () {
            var _this = this;
            var RIPPLE_SURFACE_SELECTOR = MDCSwitchFoundation.strings.RIPPLE_SURFACE_SELECTOR;
            var rippleSurface = this.root_.querySelector(RIPPLE_SURFACE_SELECTOR);
            // DO NOT INLINE this variable. For backward compatibility, foundations take a Partial<MDCFooAdapter>.
            // To ensure we don't accidentally omit any methods, we need a separate, strongly typed adapter variable.
            var adapter = __assign({}, MDCRipple.createAdapter(this), { addClass: function (className) { return rippleSurface.classList.add(className); }, computeBoundingRect: function () { return rippleSurface.getBoundingClientRect(); }, deregisterInteractionHandler: function (evtType, handler) {
                    _this.nativeControl_.removeEventListener(evtType, handler, applyPassive());
                }, isSurfaceActive: function () { return matches(_this.nativeControl_, ':active'); }, isUnbounded: function () { return true; }, registerInteractionHandler: function (evtType, handler) {
                    _this.nativeControl_.addEventListener(evtType, handler, applyPassive());
                }, removeClass: function (className) { return rippleSurface.classList.remove(className); }, updateCssVariable: function (varName, value) {
                    rippleSurface.style.setProperty(varName, value);
                } });
            return new MDCRipple(this.root_, new MDCRippleFoundation(adapter));
        };
        Object.defineProperty(MDCSwitch.prototype, "nativeControl_", {
            get: function () {
                var NATIVE_CONTROL_SELECTOR = MDCSwitchFoundation.strings.NATIVE_CONTROL_SELECTOR;
                return this.root_.querySelector(NATIVE_CONTROL_SELECTOR);
            },
            enumerable: true,
            configurable: true
        });
        return MDCSwitch;
    }(MDCComponent));

    /* node_modules/@smui/switch/Switch.svelte generated by Svelte v3.19.1 */

    function create_fragment$i(ctx) {
    	let div3;
    	let div0;
    	let t;
    	let div2;
    	let div1;
    	let input;
    	let useActions_action;
    	let useActions_action_1;
    	let forwardEvents_action;
    	let dispose;

    	let input_levels = [
    		{
    			class: "mdc-switch__native-control " + /*input$class*/ ctx[6]
    		},
    		{ type: "checkbox" },
    		{ role: "switch" },
    		/*inputProps*/ ctx[11],
    		{ disabled: /*disabled*/ ctx[2] },
    		{
    			__value: /*valueKey*/ ctx[4] === /*uninitializedValue*/ ctx[10]
    			? /*value*/ ctx[3]
    			: /*valueKey*/ ctx[4]
    		},
    		exclude(prefixFilter(/*$$props*/ ctx[13], "input$"), ["use", "class"])
    	];

    	let input_data = {};

    	for (let i = 0; i < input_levels.length; i += 1) {
    		input_data = assign(input_data, input_levels[i]);
    	}

    	let div3_levels = [
    		{
    			class: "\n    mdc-switch\n    " + /*className*/ ctx[1] + "\n    " + (/*disabled*/ ctx[2] ? "mdc-switch--disabled" : "") + "\n    " + (/*nativeChecked*/ ctx[8] ? "mdc-switch--checked" : "") + "\n  "
    		},
    		exclude(/*$$props*/ ctx[13], ["use", "class", "disabled", "group", "checked", "value", "input$"])
    	];

    	let div3_data = {};

    	for (let i = 0; i < div3_levels.length; i += 1) {
    		div3_data = assign(div3_data, div3_levels[i]);
    	}

    	return {
    		c() {
    			div3 = element("div");
    			div0 = element("div");
    			t = space();
    			div2 = element("div");
    			div1 = element("div");
    			input = element("input");
    			attr(div0, "class", "mdc-switch__track");
    			set_attributes(input, input_data);
    			attr(div1, "class", "mdc-switch__thumb");
    			attr(div2, "class", "mdc-switch__thumb-underlay");
    			set_attributes(div3, div3_data);
    		},
    		m(target, anchor) {
    			insert(target, div3, anchor);
    			append(div3, div0);
    			append(div3, t);
    			append(div3, div2);
    			append(div2, div1);
    			append(div1, input);
    			input.checked = /*nativeChecked*/ ctx[8];
    			/*div3_binding*/ ctx[24](div3);

    			dispose = [
    				action_destroyer(useActions_action = useActions.call(null, input, /*input$use*/ ctx[5])),
    				listen(input, "change", /*input_change_handler*/ ctx[23]),
    				listen(input, "change", /*handleChange*/ ctx[12]),
    				listen(input, "change", /*change_handler*/ ctx[21]),
    				listen(input, "input", /*input_handler*/ ctx[22]),
    				action_destroyer(useActions_action_1 = useActions.call(null, div3, /*use*/ ctx[0])),
    				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[9].call(null, div3))
    			];
    		},
    		p(ctx, [dirty]) {
    			set_attributes(input, get_spread_update(input_levels, [
    				dirty & /*input$class*/ 64 && {
    					class: "mdc-switch__native-control " + /*input$class*/ ctx[6]
    				},
    				{ type: "checkbox" },
    				{ role: "switch" },
    				dirty & /*inputProps*/ 2048 && /*inputProps*/ ctx[11],
    				dirty & /*disabled*/ 4 && { disabled: /*disabled*/ ctx[2] },
    				dirty & /*valueKey, uninitializedValue, value*/ 1048 && {
    					__value: /*valueKey*/ ctx[4] === /*uninitializedValue*/ ctx[10]
    					? /*value*/ ctx[3]
    					: /*valueKey*/ ctx[4]
    				},
    				dirty & /*exclude, prefixFilter, $$props*/ 8192 && exclude(prefixFilter(/*$$props*/ ctx[13], "input$"), ["use", "class"])
    			]));

    			if (useActions_action && is_function(useActions_action.update) && dirty & /*input$use*/ 32) useActions_action.update.call(null, /*input$use*/ ctx[5]);

    			if (dirty & /*nativeChecked*/ 256) {
    				input.checked = /*nativeChecked*/ ctx[8];
    			}

    			set_attributes(div3, get_spread_update(div3_levels, [
    				dirty & /*className, disabled, nativeChecked*/ 262 && {
    					class: "\n    mdc-switch\n    " + /*className*/ ctx[1] + "\n    " + (/*disabled*/ ctx[2] ? "mdc-switch--disabled" : "") + "\n    " + (/*nativeChecked*/ ctx[8] ? "mdc-switch--checked" : "") + "\n  "
    				},
    				dirty & /*exclude, $$props*/ 8192 && exclude(/*$$props*/ ctx[13], ["use", "class", "disabled", "group", "checked", "value", "input$"])
    			]));

    			if (useActions_action_1 && is_function(useActions_action_1.update) && dirty & /*use*/ 1) useActions_action_1.update.call(null, /*use*/ ctx[0]);
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div3);
    			/*div3_binding*/ ctx[24](null);
    			run_all(dispose);
    		}
    	};
    }

    function instance$i($$self, $$props, $$invalidate) {
    	const forwardEvents = forwardEventsBuilder(current_component);

    	let uninitializedValue = () => {
    		
    	};

    	let { use = [] } = $$props;
    	let { class: className = "" } = $$props;
    	let { disabled = false } = $$props;
    	let { group = uninitializedValue } = $$props;
    	let { checked = uninitializedValue } = $$props;
    	let { value = null } = $$props;
    	let { valueKey = uninitializedValue } = $$props;
    	let { input$use = [] } = $$props;
    	let { input$class = "" } = $$props;
    	let element;
    	let switchControl;
    	let formField = getContext("SMUI:form-field");
    	let inputProps = getContext("SMUI:generic:input:props") || {};
    	let setChecked = getContext("SMUI:generic:input:setChecked");

    	let nativeChecked = group === uninitializedValue
    	? checked === uninitializedValue ? false : checked
    	: group.indexOf(value) !== -1;

    	let previousChecked = checked;

    	onMount(() => {
    		$$invalidate(17, switchControl = new MDCSwitch(element));

    		if (formField && formField()) {
    			formField().input = switchControl;
    		}
    	});

    	onDestroy(() => {
    		switchControl && switchControl.destroy();
    	});

    	function handleChange(e) {
    		if (group !== uninitializedValue) {
    			const idx = group.indexOf(value);

    			if (switchControl.checked && idx === -1) {
    				group.push(value);
    				$$invalidate(14, group);
    			} else if (!switchControl.checked && idx !== -1) {
    				group.splice(idx, 1);
    				$$invalidate(14, group);
    			}
    		}
    	}

    	function getId() {
    		return inputProps && inputProps.id;
    	}

    	function change_handler(event) {
    		bubble($$self, event);
    	}

    	function input_handler(event) {
    		bubble($$self, event);
    	}

    	function input_change_handler() {
    		nativeChecked = this.checked;
    		((($$invalidate(8, nativeChecked), $$invalidate(15, checked)), $$invalidate(10, uninitializedValue)), $$invalidate(18, previousChecked));
    	}

    	function div3_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(7, element = $$value);
    		});
    	}

    	$$self.$set = $$new_props => {
    		$$invalidate(13, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		if ("use" in $$new_props) $$invalidate(0, use = $$new_props.use);
    		if ("class" in $$new_props) $$invalidate(1, className = $$new_props.class);
    		if ("disabled" in $$new_props) $$invalidate(2, disabled = $$new_props.disabled);
    		if ("group" in $$new_props) $$invalidate(14, group = $$new_props.group);
    		if ("checked" in $$new_props) $$invalidate(15, checked = $$new_props.checked);
    		if ("value" in $$new_props) $$invalidate(3, value = $$new_props.value);
    		if ("valueKey" in $$new_props) $$invalidate(4, valueKey = $$new_props.valueKey);
    		if ("input$use" in $$new_props) $$invalidate(5, input$use = $$new_props.input$use);
    		if ("input$class" in $$new_props) $$invalidate(6, input$class = $$new_props.input$class);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*checked, previousChecked, nativeChecked*/ 295168) {
    			 if (checked !== uninitializedValue) {
    				if (checked === previousChecked) {
    					$$invalidate(15, checked = nativeChecked);
    				} else if (nativeChecked !== checked) {
    					$$invalidate(8, nativeChecked = checked);
    				}

    				$$invalidate(18, previousChecked = checked);
    			}
    		}

    		if ($$self.$$.dirty & /*nativeChecked*/ 256) {
    			 if (setChecked) {
    				setChecked(nativeChecked);
    			}
    		}

    		if ($$self.$$.dirty & /*switchControl, group, value, checked*/ 180232) {
    			 if (switchControl) {
    				if (group !== uninitializedValue) {
    					const isChecked = group.indexOf(value) !== -1;

    					if (switchControl.checked !== isChecked) {
    						$$invalidate(17, switchControl.checked = isChecked, switchControl);
    					}
    				} else if (checked !== uninitializedValue && switchControl.checked !== checked) {
    					$$invalidate(17, switchControl.checked = checked, switchControl);
    				}
    			}
    		}

    		if ($$self.$$.dirty & /*switchControl, disabled*/ 131076) {
    			 if (switchControl && switchControl.disabled !== disabled) {
    				$$invalidate(17, switchControl.disabled = disabled, switchControl);
    			}
    		}

    		if ($$self.$$.dirty & /*switchControl, valueKey, value*/ 131096) {
    			 if (switchControl && valueKey === uninitializedValue && switchControl.value !== value) {
    				$$invalidate(17, switchControl.value = value, switchControl);
    			}
    		}

    		if ($$self.$$.dirty & /*switchControl, valueKey*/ 131088) {
    			 if (switchControl && valueKey !== uninitializedValue && switchControl.value !== valueKey) {
    				$$invalidate(17, switchControl.value = valueKey, switchControl);
    			}
    		}
    	};

    	$$props = exclude_internal_props($$props);

    	return [
    		use,
    		className,
    		disabled,
    		value,
    		valueKey,
    		input$use,
    		input$class,
    		element,
    		nativeChecked,
    		forwardEvents,
    		uninitializedValue,
    		inputProps,
    		handleChange,
    		$$props,
    		group,
    		checked,
    		getId,
    		switchControl,
    		previousChecked,
    		formField,
    		setChecked,
    		change_handler,
    		input_handler,
    		input_change_handler,
    		div3_binding
    	];
    }

    class Switch extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$i, create_fragment$i, safe_not_equal, {
    			use: 0,
    			class: 1,
    			disabled: 2,
    			group: 14,
    			checked: 15,
    			value: 3,
    			valueKey: 4,
    			input$use: 5,
    			input$class: 6,
    			getId: 16
    		});
    	}

    	get getId() {
    		return this.$$.ctx[16];
    	}
    }

    /**
     * @license
     * Copyright 2017 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var cssClasses$c = {
        ROOT: 'mdc-form-field',
    };
    var strings$a = {
        LABEL_SELECTOR: '.mdc-form-field > label',
    };

    /**
     * @license
     * Copyright 2017 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var MDCFormFieldFoundation = /** @class */ (function (_super) {
        __extends(MDCFormFieldFoundation, _super);
        function MDCFormFieldFoundation(adapter) {
            var _this = _super.call(this, __assign({}, MDCFormFieldFoundation.defaultAdapter, adapter)) || this;
            _this.clickHandler_ = function () { return _this.handleClick_(); };
            return _this;
        }
        Object.defineProperty(MDCFormFieldFoundation, "cssClasses", {
            get: function () {
                return cssClasses$c;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCFormFieldFoundation, "strings", {
            get: function () {
                return strings$a;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCFormFieldFoundation, "defaultAdapter", {
            get: function () {
                return {
                    activateInputRipple: function () { return undefined; },
                    deactivateInputRipple: function () { return undefined; },
                    deregisterInteractionHandler: function () { return undefined; },
                    registerInteractionHandler: function () { return undefined; },
                };
            },
            enumerable: true,
            configurable: true
        });
        MDCFormFieldFoundation.prototype.init = function () {
            this.adapter_.registerInteractionHandler('click', this.clickHandler_);
        };
        MDCFormFieldFoundation.prototype.destroy = function () {
            this.adapter_.deregisterInteractionHandler('click', this.clickHandler_);
        };
        MDCFormFieldFoundation.prototype.handleClick_ = function () {
            var _this = this;
            this.adapter_.activateInputRipple();
            requestAnimationFrame(function () { return _this.adapter_.deactivateInputRipple(); });
        };
        return MDCFormFieldFoundation;
    }(MDCFoundation));

    /**
     * @license
     * Copyright 2017 Google Inc.
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */
    var MDCFormField = /** @class */ (function (_super) {
        __extends(MDCFormField, _super);
        function MDCFormField() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        MDCFormField.attachTo = function (root) {
            return new MDCFormField(root);
        };
        Object.defineProperty(MDCFormField.prototype, "input", {
            get: function () {
                return this.input_;
            },
            set: function (input) {
                this.input_ = input;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(MDCFormField.prototype, "label_", {
            get: function () {
                var LABEL_SELECTOR = MDCFormFieldFoundation.strings.LABEL_SELECTOR;
                return this.root_.querySelector(LABEL_SELECTOR);
            },
            enumerable: true,
            configurable: true
        });
        MDCFormField.prototype.getDefaultFoundation = function () {
            var _this = this;
            // DO NOT INLINE this variable. For backward compatibility, foundations take a Partial<MDCFooAdapter>.
            // To ensure we don't accidentally omit any methods, we need a separate, strongly typed adapter variable.
            var adapter = {
                activateInputRipple: function () {
                    if (_this.input_ && _this.input_.ripple) {
                        _this.input_.ripple.activate();
                    }
                },
                deactivateInputRipple: function () {
                    if (_this.input_ && _this.input_.ripple) {
                        _this.input_.ripple.deactivate();
                    }
                },
                deregisterInteractionHandler: function (evtType, handler) {
                    if (_this.label_) {
                        _this.label_.removeEventListener(evtType, handler);
                    }
                },
                registerInteractionHandler: function (evtType, handler) {
                    if (_this.label_) {
                        _this.label_.addEventListener(evtType, handler);
                    }
                },
            };
            return new MDCFormFieldFoundation(adapter);
        };
        return MDCFormField;
    }(MDCComponent));

    /* node_modules/@smui/form-field/FormField.svelte generated by Svelte v3.19.1 */
    const get_label_slot_changes$1 = dirty => ({});
    const get_label_slot_context$1 = ctx => ({});

    function create_fragment$j(ctx) {
    	let div;
    	let t;
    	let label;
    	let useActions_action;
    	let useActions_action_1;
    	let forwardEvents_action;
    	let current;
    	let dispose;
    	const default_slot_template = /*$$slots*/ ctx[10].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[9], null);
    	const label_slot_template = /*$$slots*/ ctx[10].label;
    	const label_slot = create_slot(label_slot_template, ctx, /*$$scope*/ ctx[9], get_label_slot_context$1);

    	let label_levels = [
    		{ for: /*inputId*/ ctx[3] },
    		exclude(prefixFilter(/*$$props*/ ctx[7], "label$"), ["use"])
    	];

    	let label_data = {};

    	for (let i = 0; i < label_levels.length; i += 1) {
    		label_data = assign(label_data, label_levels[i]);
    	}

    	let div_levels = [
    		{
    			class: "\n    mdc-form-field\n    " + /*className*/ ctx[1] + "\n    " + (/*align*/ ctx[2] === "end"
    			? "mdc-form-field--align-end"
    			: "") + "\n  "
    		},
    		exclude(/*$$props*/ ctx[7], ["use", "class", "alignEnd", "inputId", "label$"])
    	];

    	let div_data = {};

    	for (let i = 0; i < div_levels.length; i += 1) {
    		div_data = assign(div_data, div_levels[i]);
    	}

    	return {
    		c() {
    			div = element("div");
    			if (default_slot) default_slot.c();
    			t = space();
    			label = element("label");
    			if (label_slot) label_slot.c();
    			set_attributes(label, label_data);
    			set_attributes(div, div_data);
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			append(div, t);
    			append(div, label);

    			if (label_slot) {
    				label_slot.m(label, null);
    			}

    			/*div_binding*/ ctx[11](div);
    			current = true;

    			dispose = [
    				action_destroyer(useActions_action = useActions.call(null, label, /*label$use*/ ctx[4])),
    				action_destroyer(useActions_action_1 = useActions.call(null, div, /*use*/ ctx[0])),
    				action_destroyer(forwardEvents_action = /*forwardEvents*/ ctx[6].call(null, div))
    			];
    		},
    		p(ctx, [dirty]) {
    			if (default_slot && default_slot.p && dirty & /*$$scope*/ 512) {
    				default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[9], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[9], dirty, null));
    			}

    			if (label_slot && label_slot.p && dirty & /*$$scope*/ 512) {
    				label_slot.p(get_slot_context(label_slot_template, ctx, /*$$scope*/ ctx[9], get_label_slot_context$1), get_slot_changes(label_slot_template, /*$$scope*/ ctx[9], dirty, get_label_slot_changes$1));
    			}

    			set_attributes(label, get_spread_update(label_levels, [
    				dirty & /*inputId*/ 8 && { for: /*inputId*/ ctx[3] },
    				dirty & /*exclude, prefixFilter, $$props*/ 128 && exclude(prefixFilter(/*$$props*/ ctx[7], "label$"), ["use"])
    			]));

    			if (useActions_action && is_function(useActions_action.update) && dirty & /*label$use*/ 16) useActions_action.update.call(null, /*label$use*/ ctx[4]);

    			set_attributes(div, get_spread_update(div_levels, [
    				dirty & /*className, align*/ 6 && {
    					class: "\n    mdc-form-field\n    " + /*className*/ ctx[1] + "\n    " + (/*align*/ ctx[2] === "end"
    					? "mdc-form-field--align-end"
    					: "") + "\n  "
    				},
    				dirty & /*exclude, $$props*/ 128 && exclude(/*$$props*/ ctx[7], ["use", "class", "alignEnd", "inputId", "label$"])
    			]));

    			if (useActions_action_1 && is_function(useActions_action_1.update) && dirty & /*use*/ 1) useActions_action_1.update.call(null, /*use*/ ctx[0]);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			transition_in(label_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			transition_out(label_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (default_slot) default_slot.d(detaching);
    			if (label_slot) label_slot.d(detaching);
    			/*div_binding*/ ctx[11](null);
    			run_all(dispose);
    		}
    	};
    }

    let counter = 0;

    function instance$j($$self, $$props, $$invalidate) {
    	const forwardEvents = forwardEventsBuilder(current_component);
    	let { use = [] } = $$props;
    	let { class: className = "" } = $$props;
    	let { align = "start" } = $$props;
    	let { inputId = "SMUI-form-field-" + counter++ } = $$props;
    	let { label$use = [] } = $$props;
    	let element;
    	let formField;
    	setContext("SMUI:form-field", () => formField);
    	setContext("SMUI:generic:input:props", { id: inputId });

    	onMount(() => {
    		formField = new MDCFormField(element);
    	});

    	onDestroy(() => {
    		formField && formField.destroy();
    	});

    	let { $$slots = {}, $$scope } = $$props;

    	function div_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(5, element = $$value);
    		});
    	}

    	$$self.$set = $$new_props => {
    		$$invalidate(7, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		if ("use" in $$new_props) $$invalidate(0, use = $$new_props.use);
    		if ("class" in $$new_props) $$invalidate(1, className = $$new_props.class);
    		if ("align" in $$new_props) $$invalidate(2, align = $$new_props.align);
    		if ("inputId" in $$new_props) $$invalidate(3, inputId = $$new_props.inputId);
    		if ("label$use" in $$new_props) $$invalidate(4, label$use = $$new_props.label$use);
    		if ("$$scope" in $$new_props) $$invalidate(9, $$scope = $$new_props.$$scope);
    	};

    	$$props = exclude_internal_props($$props);

    	return [
    		use,
    		className,
    		align,
    		inputId,
    		label$use,
    		element,
    		forwardEvents,
    		$$props,
    		formField,
    		$$scope,
    		$$slots,
    		div_binding
    	];
    }

    class FormField extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$j, create_fragment$j, safe_not_equal, {
    			use: 0,
    			class: 1,
    			align: 2,
    			inputId: 3,
    			label$use: 4
    		});
    	}
    }

    /* src/ColorTable.svelte generated by Svelte v3.19.1 */

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[8] = list[i];
    	return child_ctx;
    }

    // (80:6) <span slot="label">
    function create_label_slot(ctx) {
    	let span;

    	return {
    		c() {
    			span = element("span");
    			span.textContent = "Favorite";
    			attr(span, "slot", "label");
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    // (78:4) <FormField class="favorite">
    function create_default_slot_13(ctx) {
    	let updating_checked;
    	let t;
    	let current;

    	function switch_1_checked_binding(value) {
    		/*switch_1_checked_binding*/ ctx[7].call(null, value);
    	}

    	let switch_1_props = {};

    	if (/*favoriteOnly*/ ctx[1] !== void 0) {
    		switch_1_props.checked = /*favoriteOnly*/ ctx[1];
    	}

    	const switch_1 = new Switch({ props: switch_1_props });
    	binding_callbacks.push(() => bind(switch_1, "checked", switch_1_checked_binding));

    	return {
    		c() {
    			create_component(switch_1.$$.fragment);
    			t = space();
    		},
    		m(target, anchor) {
    			mount_component(switch_1, target, anchor);
    			insert(target, t, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const switch_1_changes = {};

    			if (!updating_checked && dirty & /*favoriteOnly*/ 2) {
    				updating_checked = true;
    				switch_1_changes.checked = /*favoriteOnly*/ ctx[1];
    				add_flush_callback(() => updating_checked = false);
    			}

    			switch_1.$set(switch_1_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(switch_1.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(switch_1.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(switch_1, detaching);
    			if (detaching) detach(t);
    		}
    	};
    }

    // (89:10) <Cell>
    function create_default_slot_12(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Fav");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (90:10) <Cell>
    function create_default_slot_11(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Name");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (91:10) <Cell>
    function create_default_slot_10(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Color");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (92:10) <Cell>
    function create_default_slot_9(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("HEX");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (88:8) <Row>
    function create_default_slot_8(ctx) {
    	let t0;
    	let t1;
    	let t2;
    	let t3;
    	let current;

    	const cell0 = new Cell({
    			props: {
    				$$slots: { default: [create_default_slot_12] },
    				$$scope: { ctx }
    			}
    		});

    	const cell1 = new Cell({
    			props: {
    				$$slots: { default: [create_default_slot_11] },
    				$$scope: { ctx }
    			}
    		});

    	const cell2 = new Cell({
    			props: {
    				$$slots: { default: [create_default_slot_10] },
    				$$scope: { ctx }
    			}
    		});

    	const cell3 = new Cell({
    			props: {
    				$$slots: { default: [create_default_slot_9] },
    				$$scope: { ctx }
    			}
    		});

    	const cell4 = new Cell({});

    	return {
    		c() {
    			create_component(cell0.$$.fragment);
    			t0 = space();
    			create_component(cell1.$$.fragment);
    			t1 = space();
    			create_component(cell2.$$.fragment);
    			t2 = space();
    			create_component(cell3.$$.fragment);
    			t3 = space();
    			create_component(cell4.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(cell0, target, anchor);
    			insert(target, t0, anchor);
    			mount_component(cell1, target, anchor);
    			insert(target, t1, anchor);
    			mount_component(cell2, target, anchor);
    			insert(target, t2, anchor);
    			mount_component(cell3, target, anchor);
    			insert(target, t3, anchor);
    			mount_component(cell4, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const cell0_changes = {};

    			if (dirty & /*$$scope*/ 2048) {
    				cell0_changes.$$scope = { dirty, ctx };
    			}

    			cell0.$set(cell0_changes);
    			const cell1_changes = {};

    			if (dirty & /*$$scope*/ 2048) {
    				cell1_changes.$$scope = { dirty, ctx };
    			}

    			cell1.$set(cell1_changes);
    			const cell2_changes = {};

    			if (dirty & /*$$scope*/ 2048) {
    				cell2_changes.$$scope = { dirty, ctx };
    			}

    			cell2.$set(cell2_changes);
    			const cell3_changes = {};

    			if (dirty & /*$$scope*/ 2048) {
    				cell3_changes.$$scope = { dirty, ctx };
    			}

    			cell3.$set(cell3_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(cell0.$$.fragment, local);
    			transition_in(cell1.$$.fragment, local);
    			transition_in(cell2.$$.fragment, local);
    			transition_in(cell3.$$.fragment, local);
    			transition_in(cell4.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(cell0.$$.fragment, local);
    			transition_out(cell1.$$.fragment, local);
    			transition_out(cell2.$$.fragment, local);
    			transition_out(cell3.$$.fragment, local);
    			transition_out(cell4.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(cell0, detaching);
    			if (detaching) detach(t0);
    			destroy_component(cell1, detaching);
    			if (detaching) detach(t1);
    			destroy_component(cell2, detaching);
    			if (detaching) detach(t2);
    			destroy_component(cell3, detaching);
    			if (detaching) detach(t3);
    			destroy_component(cell4, detaching);
    		}
    	};
    }

    // (87:6) <Head>
    function create_default_slot_7(ctx) {
    	let current;

    	const row = new Row({
    			props: {
    				$$slots: { default: [create_default_slot_8] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(row.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(row, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const row_changes = {};

    			if (dirty & /*$$scope*/ 2048) {
    				row_changes.$$scope = { dirty, ctx };
    			}

    			row.$set(row_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(row.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(row.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(row, detaching);
    		}
    	};
    }

    // (108:14) {:else}
    function create_else_block$4(ctx) {
    	let i;
    	let dispose;

    	return {
    		c() {
    			i = element("i");
    			i.textContent = "favorite_border";
    			set_style(i, "color", "red");
    			attr(i, "class", "material-icons svelte-ibez5a");
    		},
    		m(target, anchor) {
    			insert(target, i, anchor);

    			dispose = listen(i, "click", stop_propagation(function () {
    				if (is_function(fav(/*tableColor*/ ctx[8].id))) fav(/*tableColor*/ ctx[8].id).apply(this, arguments);
    			}));
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		d(detaching) {
    			if (detaching) detach(i);
    			dispose();
    		}
    	};
    }

    // (101:14) {#if tableColor.isFavorite}
    function create_if_block$6(ctx) {
    	let i;
    	let dispose;

    	return {
    		c() {
    			i = element("i");
    			i.textContent = "favorite";
    			set_style(i, "color", "red");
    			attr(i, "class", "material-icons svelte-ibez5a");
    		},
    		m(target, anchor) {
    			insert(target, i, anchor);

    			dispose = listen(i, "click", stop_propagation(function () {
    				if (is_function(unFav(/*tableColor*/ ctx[8].id))) unFav(/*tableColor*/ ctx[8].id).apply(this, arguments);
    			}));
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		d(detaching) {
    			if (detaching) detach(i);
    			dispose();
    		}
    	};
    }

    // (100:12) <Cell>
    function create_default_slot_6(ctx) {
    	let if_block_anchor;

    	function select_block_type(ctx, dirty) {
    		if (/*tableColor*/ ctx[8].isFavorite) return create_if_block$6;
    		return create_else_block$4;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type(ctx);

    	return {
    		c() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			}
    		},
    		d(detaching) {
    			if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    // (117:12) <Cell>
    function create_default_slot_5$1(ctx) {
    	let t_value = /*tableColor*/ ctx[8].name + "";
    	let t;

    	return {
    		c() {
    			t = text(t_value);
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*tableColors*/ 4 && t_value !== (t_value = /*tableColor*/ ctx[8].name + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (120:12) <Cell>
    function create_default_slot_4$1(ctx) {
    	let t_value = rgbToHex(/*tableColor*/ ctx[8].red, /*tableColor*/ ctx[8].green, /*tableColor*/ ctx[8].blue) + "";
    	let t;

    	return {
    		c() {
    			t = text(t_value);
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*tableColors*/ 4 && t_value !== (t_value = rgbToHex(/*tableColor*/ ctx[8].red, /*tableColor*/ ctx[8].green, /*tableColor*/ ctx[8].blue) + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (123:12) <Cell>
    function create_default_slot_3$1(ctx) {
    	let i;
    	let dispose;

    	return {
    		c() {
    			i = element("i");
    			i.textContent = "delete";
    			attr(i, "class", "material-icons svelte-ibez5a");
    		},
    		m(target, anchor) {
    			insert(target, i, anchor);

    			dispose = listen(i, "click", stop_propagation(function () {
    				if (is_function(deleteColor$1(/*tableColor*/ ctx[8].id))) deleteColor$1(/*tableColor*/ ctx[8].id).apply(this, arguments);
    			}));
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		d(detaching) {
    			if (detaching) detach(i);
    			dispose();
    		}
    	};
    }

    // (99:10) <Row on:click={selectColor(tableColor.id)}>
    function create_default_slot_2$2(ctx) {
    	let t0;
    	let t1;
    	let t2;
    	let t3;
    	let t4;
    	let current;

    	const cell0 = new Cell({
    			props: {
    				$$slots: { default: [create_default_slot_6] },
    				$$scope: { ctx }
    			}
    		});

    	const cell1 = new Cell({
    			props: {
    				$$slots: { default: [create_default_slot_5$1] },
    				$$scope: { ctx }
    			}
    		});

    	const cell2 = new Cell({
    			props: {
    				style: "background-color: " + rgbToHex(/*tableColor*/ ctx[8].red, /*tableColor*/ ctx[8].green, /*tableColor*/ ctx[8].blue)
    			}
    		});

    	const cell3 = new Cell({
    			props: {
    				$$slots: { default: [create_default_slot_4$1] },
    				$$scope: { ctx }
    			}
    		});

    	const cell4 = new Cell({
    			props: {
    				$$slots: { default: [create_default_slot_3$1] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(cell0.$$.fragment);
    			t0 = space();
    			create_component(cell1.$$.fragment);
    			t1 = space();
    			create_component(cell2.$$.fragment);
    			t2 = space();
    			create_component(cell3.$$.fragment);
    			t3 = space();
    			create_component(cell4.$$.fragment);
    			t4 = space();
    		},
    		m(target, anchor) {
    			mount_component(cell0, target, anchor);
    			insert(target, t0, anchor);
    			mount_component(cell1, target, anchor);
    			insert(target, t1, anchor);
    			mount_component(cell2, target, anchor);
    			insert(target, t2, anchor);
    			mount_component(cell3, target, anchor);
    			insert(target, t3, anchor);
    			mount_component(cell4, target, anchor);
    			insert(target, t4, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const cell0_changes = {};

    			if (dirty & /*$$scope, tableColors*/ 2052) {
    				cell0_changes.$$scope = { dirty, ctx };
    			}

    			cell0.$set(cell0_changes);
    			const cell1_changes = {};

    			if (dirty & /*$$scope, tableColors*/ 2052) {
    				cell1_changes.$$scope = { dirty, ctx };
    			}

    			cell1.$set(cell1_changes);
    			const cell2_changes = {};
    			if (dirty & /*tableColors*/ 4) cell2_changes.style = "background-color: " + rgbToHex(/*tableColor*/ ctx[8].red, /*tableColor*/ ctx[8].green, /*tableColor*/ ctx[8].blue);
    			cell2.$set(cell2_changes);
    			const cell3_changes = {};

    			if (dirty & /*$$scope, tableColors*/ 2052) {
    				cell3_changes.$$scope = { dirty, ctx };
    			}

    			cell3.$set(cell3_changes);
    			const cell4_changes = {};

    			if (dirty & /*$$scope, tableColors*/ 2052) {
    				cell4_changes.$$scope = { dirty, ctx };
    			}

    			cell4.$set(cell4_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(cell0.$$.fragment, local);
    			transition_in(cell1.$$.fragment, local);
    			transition_in(cell2.$$.fragment, local);
    			transition_in(cell3.$$.fragment, local);
    			transition_in(cell4.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(cell0.$$.fragment, local);
    			transition_out(cell1.$$.fragment, local);
    			transition_out(cell2.$$.fragment, local);
    			transition_out(cell3.$$.fragment, local);
    			transition_out(cell4.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(cell0, detaching);
    			if (detaching) detach(t0);
    			destroy_component(cell1, detaching);
    			if (detaching) detach(t1);
    			destroy_component(cell2, detaching);
    			if (detaching) detach(t2);
    			destroy_component(cell3, detaching);
    			if (detaching) detach(t3);
    			destroy_component(cell4, detaching);
    			if (detaching) detach(t4);
    		}
    	};
    }

    // (98:8) {#each tableColors as tableColor (tableColor.id)}
    function create_each_block(key_1, ctx) {
    	let first;
    	let current;

    	const row = new Row({
    			props: {
    				$$slots: { default: [create_default_slot_2$2] },
    				$$scope: { ctx }
    			}
    		});

    	row.$on("click", function () {
    		if (is_function(/*selectColor*/ ctx[3](/*tableColor*/ ctx[8].id))) /*selectColor*/ ctx[3](/*tableColor*/ ctx[8].id).apply(this, arguments);
    	});

    	return {
    		key: key_1,
    		first: null,
    		c() {
    			first = empty();
    			create_component(row.$$.fragment);
    			this.first = first;
    		},
    		m(target, anchor) {
    			insert(target, first, anchor);
    			mount_component(row, target, anchor);
    			current = true;
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			const row_changes = {};

    			if (dirty & /*$$scope, tableColors*/ 2052) {
    				row_changes.$$scope = { dirty, ctx };
    			}

    			row.$set(row_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(row.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(row.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(first);
    			destroy_component(row, detaching);
    		}
    	};
    }

    // (97:6) <Body>
    function create_default_slot_1$2(ctx) {
    	let each_blocks = [];
    	let each_1_lookup = new Map();
    	let each_1_anchor;
    	let current;
    	let each_value = /*tableColors*/ ctx[2];
    	const get_key = ctx => /*tableColor*/ ctx[8].id;

    	for (let i = 0; i < each_value.length; i += 1) {
    		let child_ctx = get_each_context(ctx, each_value, i);
    		let key = get_key(child_ctx);
    		each_1_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
    	}

    	return {
    		c() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert(target, each_1_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (dirty & /*selectColor, tableColors, deleteColor, rgbToHex, unFav, fav*/ 12) {
    				const each_value = /*tableColors*/ ctx[2];
    				group_outros();
    				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, each_1_anchor.parentNode, outro_and_destroy_block, create_each_block, each_1_anchor, get_each_context);
    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o(local) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d(detaching) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d(detaching);
    			}

    			if (detaching) detach(each_1_anchor);
    		}
    	};
    }

    // (86:4) <DataTable style="width: 100%">
    function create_default_slot$3(ctx) {
    	let t;
    	let current;

    	const head = new Head({
    			props: {
    				$$slots: { default: [create_default_slot_7] },
    				$$scope: { ctx }
    			}
    		});

    	const body = new Body({
    			props: {
    				$$slots: { default: [create_default_slot_1$2] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(head.$$.fragment);
    			t = space();
    			create_component(body.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(head, target, anchor);
    			insert(target, t, anchor);
    			mount_component(body, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const head_changes = {};

    			if (dirty & /*$$scope*/ 2048) {
    				head_changes.$$scope = { dirty, ctx };
    			}

    			head.$set(head_changes);
    			const body_changes = {};

    			if (dirty & /*$$scope, tableColors*/ 2052) {
    				body_changes.$$scope = { dirty, ctx };
    			}

    			body.$set(body_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(head.$$.fragment, local);
    			transition_in(body.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(head.$$.fragment, local);
    			transition_out(body.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(head, detaching);
    			if (detaching) detach(t);
    			destroy_component(body, detaching);
    		}
    	};
    }

    function create_fragment$k(ctx) {
    	let div2;
    	let div0;
    	let updating_value;
    	let t0;
    	let div1;
    	let t1;
    	let div4;
    	let div3;
    	let current;

    	function textfield_value_binding(value) {
    		/*textfield_value_binding*/ ctx[6].call(null, value);
    	}

    	let textfield_props = {
    		label: "Filter Colors",
    		fullwidth: "true"
    	};

    	if (/*filter*/ ctx[0] !== void 0) {
    		textfield_props.value = /*filter*/ ctx[0];
    	}

    	const textfield = new Textfield({ props: textfield_props });
    	binding_callbacks.push(() => bind(textfield, "value", textfield_value_binding));

    	const formfield = new FormField({
    			props: {
    				class: "favorite",
    				$$slots: {
    					default: [create_default_slot_13],
    					label: [create_label_slot]
    				},
    				$$scope: { ctx }
    			}
    		});

    	const datatable = new DataTable({
    			props: {
    				style: "width: 100%",
    				$$slots: { default: [create_default_slot$3] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			div2 = element("div");
    			div0 = element("div");
    			create_component(textfield.$$.fragment);
    			t0 = space();
    			div1 = element("div");
    			create_component(formfield.$$.fragment);
    			t1 = space();
    			div4 = element("div");
    			div3 = element("div");
    			create_component(datatable.$$.fragment);
    			attr(div0, "bp", "offset-2 5");
    			attr(div1, "bp", "5 ");
    			attr(div2, "bp", "grid vertical-end");
    			attr(div3, "bp", "offset-2 10");
    			attr(div4, "bp", "grid");
    			attr(div4, "class", "svelte-ibez5a");
    		},
    		m(target, anchor) {
    			insert(target, div2, anchor);
    			append(div2, div0);
    			mount_component(textfield, div0, null);
    			append(div2, t0);
    			append(div2, div1);
    			mount_component(formfield, div1, null);
    			insert(target, t1, anchor);
    			insert(target, div4, anchor);
    			append(div4, div3);
    			mount_component(datatable, div3, null);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const textfield_changes = {};

    			if (!updating_value && dirty & /*filter*/ 1) {
    				updating_value = true;
    				textfield_changes.value = /*filter*/ ctx[0];
    				add_flush_callback(() => updating_value = false);
    			}

    			textfield.$set(textfield_changes);
    			const formfield_changes = {};

    			if (dirty & /*$$scope, favoriteOnly*/ 2050) {
    				formfield_changes.$$scope = { dirty, ctx };
    			}

    			formfield.$set(formfield_changes);
    			const datatable_changes = {};

    			if (dirty & /*$$scope, tableColors*/ 2052) {
    				datatable_changes.$$scope = { dirty, ctx };
    			}

    			datatable.$set(datatable_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(textfield.$$.fragment, local);
    			transition_in(formfield.$$.fragment, local);
    			transition_in(datatable.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(textfield.$$.fragment, local);
    			transition_out(formfield.$$.fragment, local);
    			transition_out(datatable.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div2);
    			destroy_component(textfield);
    			destroy_component(formfield);
    			if (detaching) detach(t1);
    			if (detaching) detach(div4);
    			destroy_component(datatable);
    		}
    	};
    }

    function unFav(id) {
    	colorStore$1.updateFavorite(id, false);
    }

    function fav(id) {
    	console.log("called fav");
    	colorStore$1.updateFavorite(id, true);
    }

    function deleteColor$1(id) {
    	colorStore$1.deleteColor(id);
    }

    function instance$k($$self, $$props, $$invalidate) {
    	let filter = "";
    	let favoriteOnly = false;
    	let colors = [];

    	function getTableColors(colorList, favOnly, filterName) {
    		const tableColors = favOnly ? colors.filter(c => c.isFavorite) : colors;

    		if (filterName) {
    			return tableColors.filter(c => c.name.indexOf(filter) > -1);
    		}

    		return tableColors;
    	}

    	function selectColor(id) {
    		console.log("called selectColor");
    		const { red, green, blue, name } = colors.find(c => c.id === id);
    		selectedColor$1.selectColor(red, green, blue, name, id);
    	}

    	onMount(() => {
    		colorStore$1.subscribe(colorList => {
    			$$invalidate(4, colors = colorList);
    		});
    	});

    	function textfield_value_binding(value) {
    		filter = value;
    		$$invalidate(0, filter);
    	}

    	function switch_1_checked_binding(value) {
    		favoriteOnly = value;
    		$$invalidate(1, favoriteOnly);
    	}

    	let tableColors;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*colors, favoriteOnly, filter*/ 19) {
    			 $$invalidate(2, tableColors = getTableColors(colors, favoriteOnly, filter).sort((a, b) => a.name.localeCompare(b.name)));
    		}
    	};

    	return [
    		filter,
    		favoriteOnly,
    		tableColors,
    		selectColor,
    		colors,
    		getTableColors,
    		textfield_value_binding,
    		switch_1_checked_binding
    	];
    }

    class ColorTable extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$k, create_fragment$k, safe_not_equal, {});
    	}
    }

    /* src/App.svelte generated by Svelte v3.19.1 */

    function create_fragment$l(ctx) {
    	let div1;
    	let t1;
    	let t2;
    	let current;
    	const savedcolor = new SaveColor({});
    	const colortable = new ColorTable({});

    	return {
    		c() {
    			div1 = element("div");
    			div1.innerHTML = `<div bp="10 offset-2"><h1>Color Picker</h1></div>`;
    			t1 = space();
    			create_component(savedcolor.$$.fragment);
    			t2 = space();
    			create_component(colortable.$$.fragment);
    			attr(div1, "bp", "grid");
    		},
    		m(target, anchor) {
    			insert(target, div1, anchor);
    			insert(target, t1, anchor);
    			mount_component(savedcolor, target, anchor);
    			insert(target, t2, anchor);
    			mount_component(colortable, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i(local) {
    			if (current) return;
    			transition_in(savedcolor.$$.fragment, local);
    			transition_in(colortable.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(savedcolor.$$.fragment, local);
    			transition_out(colortable.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div1);
    			if (detaching) detach(t1);
    			destroy_component(savedcolor, detaching);
    			if (detaching) detach(t2);
    			destroy_component(colortable, detaching);
    		}
    	};
    }

    class App extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, null, create_fragment$l, safe_not_equal, {});
    	}
    }

    const app = new App({
      target: document.body
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
