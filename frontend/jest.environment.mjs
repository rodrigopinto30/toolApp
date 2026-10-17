import FixedJSDOMEnvironment from "jest-fixed-jsdom";

export default class Environment extends FixedJSDOMEnvironment {
  constructor(...args) {
    super(...args);
    this.global.setImmediate = setImmediate;
    this.global.clearImmediate = clearImmediate;
  }
}
