/** @type {Record<string, any[]>} */
const garbage = {};

/**
 * @template T
 * @template {(...args: any[]) => Partial<T>} TConstructor
 * @param {TConstructor} constructor
 * @param  {Parameters<TConstructor> extends [any, ...infer R] ? R : never} args
 * @returns {T}
 */
export function create(constructor, ...args) {
  const instances = (garbage[constructor.name] ??= []);
  return /** @type {T} */ (constructor(instances.pop() ?? {}, ...args));
}

/**
 * @template T
 * @param {(...args: any[]) => Partial<T>} constructor
 * @param {T} instance
 */
export function dispose(constructor, instance) {
  const instances = (garbage[constructor.name] ??= []);
  instances.push(instance);
}
