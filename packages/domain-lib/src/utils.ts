export const deepMerge = (target: any, source: any): any => {
    Object.keys(source).forEach(key => {
        if (key === "__proto__" || key === "constructor") {
            return;
        }

        if (source[key] instanceof Object && Object.prototype.hasOwnProperty.call(target, key)) {
            target[key] = deepMerge(target[key], source[key]);
        } else {
            target[key] = source[key];
        }
    });
    return target;
};
