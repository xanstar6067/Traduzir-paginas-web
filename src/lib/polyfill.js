"use strict";

(function () {
  const root =
    typeof globalThis !== "undefined"
      ? globalThis
      : typeof self !== "undefined"
      ? self
      : typeof window !== "undefined"
      ? window
      : {};

  function define(target, name, value) {
    if (name in target) return;
    Object.defineProperty(target, name, {
      configurable: true,
      writable: true,
      value,
    });
  }

  define(Promise.prototype, "finally", function (onFinally) {
    const promise = this.constructor || Promise;
    const callback =
      typeof onFinally === "function" ? onFinally : function () {};

    return this.then(
      function (value) {
        return promise.resolve(callback()).then(function () {
          return value;
        });
      },
      function (reason) {
        return promise.resolve(callback()).then(function () {
          throw reason;
        });
      }
    );
  });

  define(Array.prototype, "includes", function (searchElement, fromIndex) {
    const length = this.length >>> 0;
    if (length === 0) return false;

    let index = fromIndex | 0;
    if (index < 0) index = Math.max(length + index, 0);

    while (index < length) {
      const value = this[index];
      if (
        value === searchElement ||
        (value !== value && searchElement !== searchElement)
      ) {
        return true;
      }
      index++;
    }

    return false;
  });

  define(String.prototype, "replaceAll", function (searchValue, replaceValue) {
    const source = String(this);

    if (searchValue instanceof RegExp) {
      if (!searchValue.global) {
        throw new TypeError("String.prototype.replaceAll called with a non-global RegExp");
      }
      return source.replace(searchValue, replaceValue);
    }

    const searchString = String(searchValue);
    if (searchString === "") {
      return source.replace(/(?:)/g, replaceValue);
    }

    if (typeof replaceValue === "function") {
      let result = "";
      let position = 0;
      let matchIndex = source.indexOf(searchString);

      while (matchIndex !== -1) {
        result += source.slice(position, matchIndex);
        result += String(replaceValue(searchString, matchIndex, source));
        position = matchIndex + searchString.length;
        matchIndex = source.indexOf(searchString, position);
      }

      return result + source.slice(position);
    }

    return source.split(searchString).join(String(replaceValue));
  });

  define(String.prototype, "matchAll", function (regexp) {
    if (!(regexp instanceof RegExp)) {
      regexp = new RegExp(regexp, "g");
    } else if (!regexp.global) {
      throw new TypeError("String.prototype.matchAll called with a non-global RegExp");
    } else {
      regexp = new RegExp(
        regexp.source,
        regexp.flags ||
          (regexp.ignoreCase ? "i" : "") +
            (regexp.multiline ? "m" : "") +
            (regexp.unicode ? "u" : "") +
            (regexp.sticky ? "y" : "") +
            "g"
      );
    }

    const source = String(this);

    return {
      next: function () {
        const match = regexp.exec(source);
        if (match === null) return { done: true, value: undefined };
        if (match[0] === "") regexp.lastIndex++;
        return { done: false, value: match };
      },
      [Symbol.iterator]: function () {
        return this;
      },
    };
  });

  define(Object, "fromEntries", function (entries) {
    const object = {};

    for (const entry of entries) {
      if (Object(entry) !== entry) {
        throw new TypeError("Iterator value " + entry + " is not an entry object");
      }
      object[entry[0]] = entry[1];
    }

    return object;
  });

  function cloneValue(value, seen) {
    if (value === null || typeof value !== "object") return value;
    if (seen.has(value)) return seen.get(value);

    let cloned;

    if (Array.isArray(value)) {
      cloned = [];
      seen.set(value, cloned);
      for (const item of value) cloned.push(cloneValue(item, seen));
      return cloned;
    }

    if (value instanceof Map) {
      cloned = new Map();
      seen.set(value, cloned);
      value.forEach(function (mapValue, mapKey) {
        cloned.set(cloneValue(mapKey, seen), cloneValue(mapValue, seen));
      });
      return cloned;
    }

    if (value instanceof Set) {
      cloned = new Set();
      seen.set(value, cloned);
      value.forEach(function (setValue) {
        cloned.add(cloneValue(setValue, seen));
      });
      return cloned;
    }

    if (value instanceof Date) return new Date(value.getTime());
    if (value instanceof RegExp) return new RegExp(value.source, value.flags);

    cloned = Object.create(Object.getPrototypeOf(value));
    seen.set(value, cloned);

    for (const key of Object.keys(value)) {
      cloned[key] = cloneValue(value[key], seen);
    }

    return cloned;
  }

  define(root, "structuredClone", function (value) {
    return cloneValue(value, new Map());
  });
})();
