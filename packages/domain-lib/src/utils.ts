export const deepMerge = (target: any, source: any): any => {
    Object.keys(source).forEach(key => {
        if (source[key] instanceof Object && key in target) {
            target[key] = deepMerge(target[key], source[key]);
        } else {
            target[key] = source[key];
        }
    });
    return target;
};