export class RubyMarshal {
  private td = new TextDecoder();

  // 已序列化的符号
  private SYMBOL_CACHE: string[] = [];

  // 已序列化的非符号对象
  private OBJECT_CACHE: any[] = [];
  private cache_symbol(sym: string) {
    this.SYMBOL_CACHE.push(sym);
    return sym;
  }
  private cache_object(obj: any) {
    this.OBJECT_CACHE.push(obj);
    return obj;
  }

  constructor(public v: DataView, public offset: number = 2) {}

  private _getByte(signde = false) {
    const b = signde
      ? this.v.getInt8(this.offset)
      : this.v.getUint8(this.offset);
    this.offset++;
    return b;
  }

  private _readStr(len: number) {
    const bytes = [];
    for (let i = 0; i < len; i++) {
      bytes.push(this._getByte());
    }
    return this.td.decode(new Uint8Array(bytes));
  }

  private throw_error(name: string) {
    return `Error ${name} offset:${this.offset} 0x${this.offset.toString(16)}`;
  }

  public parser(ic: boolean = false): any {
    const type = this._getByte();

    switch (type) {
      case 0x5b:
        return this.parserArray();

      case 0x3a:
        return this.parserSymbol();

      case 0x3b:
        return this.parserSymbolLink();

      case 0x46:
        return false;

      case 0x54:
        return true;

      case 0x30:
        return null;

      case 0x69:
        return this.parserFixnum();

      case 0x66:
        return this.parserFloat();

      case 0x7b:
        return this.parserHash();

      case 0x7d:
        return this.parserHashNew();

      case 0x40:
        return this.parserObjectLink();

      case 0x22:
        return this.parserString();

      case 0x6f:
        return this.parserO();

      case 0x49:
        return this.parser(true);

      case 0x6c:
        return this.parserBignum();

      case 0x63:
        return this.parserClass();

      case 0x6d:
        return this.parserModule();

      case 0x2f:
        return this.parserRegexp();

      case 0x53:
        return this.parserStruct();

      case 0x43:
        return this.parserC(ic);

      case 0x65:
        return this.parserExtendObject();

      case 0x55:
        return this.parserU();

      case 0x75:
        return this.parser_u();

      case 0x04:
        // 在二进制文件中存在多个marshal
        if (this.v.getUint8(this.offset) === 0x08) {
          const m = new RubyMarshal(this.v, ++this.offset);
          const rr = m.parser();
          this.offset = m.offset;
          return rr;
        }

        break;

      case 0x06:
        // 编码格式 https://github.com/ruby/ruby/blob/master/spec/ruby/core/marshal/dump_spec.rb#L63
        // 无视掉下一个key-value
        this.parser();
        this.parser();
        return this.parser();
      default:
        break;
    }

    this.offset--;
    throw this.throw_error("parser");
  }

  private parserArray() {
    const r = [];
    this.cache_object(r);
    let len = this.parserFixnum();
    while (len--) r.push(this.parser());
    return r;
  }

  private parserO() {
    this.parser(); // object name
    return this.parserHash();
  }

  private parserSymbol(): string {
    return this.cache_symbol(this._readStr(this.parserFixnum()));
  }

  private parserFixnum(): number {
    // Fixnum 最多只可能占 4 个字节
    let x = this._getByte(true);

    // 有 5 种不同的情况
    if (x === 0) return 0;

    if (-128 <= x && x <= -5) {
      // 当前字节为直接数据 x+5
      return x + 5;
    } else if (-4 <= x && x <= -1) {
      // 接下来是有 |x| 个字节的负整数
      let result = -1;
      for (let i = 0; i < Math.abs(x); i++) {
        const a = ~(0xff << (8 * i));
        const b = this._getByte() << (8 * i);
        result = (result & a) | b;
      }
      return result;
    } else if (1 <= x && x <= 4) {
      // 接下来是有 |x| 个字节的正整数
      let result = 0;
      for (let i = 0; i < x; i++) {
        result |= this._getByte() << (8 * i);
      }
      return result;
    } else if (5 <= x && x <= 127) {
      // 当前字节为直接数据 x-5
      return x - 5;
    } else {
      throw this.throw_error("parserFixnum");
    }
  }

  private parserFloat(): number {
    // 浮点字符串
    return parseFloat(this.cache_object(this._readStr(this.parserFixnum())));
  }

  private parserHashNew() {
    // Hash.new(1)
    // size 0
    // init 1

    // h = Hash.new(2)
    // h[2] = 2
    // h[3] = 3
    // size 2
    // init 2

    const r = this.parserHash();
    r[`Hash.new`] = this.parser(); // 初始化数据
    return r;
  }

  private parserHash() {
    // { 1=>"1" } 键值对
    const r = this.cache_object({});

    let kvSize = this.parserFixnum();
    while (kvSize--) {
      const k = this.parser();
      const v = this.parser();
      r[k as any] = v;
    }

    return r;
  }

  private parserSymbolLink() {
    // 符号链接
    return this.SYMBOL_CACHE[this.parserFixnum()];
  }

  private parserObjectLink() {
    // 引用链接
    // 可能照成循环依赖，无法to json
    // return this.OBJECT_CACHE[this.parserFixnum()];

    // 避免循环依赖
    return `@${this.parserFixnum()}@`;
  }

  private parserString() {
    // "string"
    return this._readStr(this.parserFixnum());
  }

  // https://www.codeproject.com/Answers/5282788/Decode-a-byte-array-to-a-signed-integer-up-to-64-b#answer3
  private parserBignum() {
    // 123456789 ** -2
    // 123456789 ** 2

    const signd = this._getByte();
    let x = this.parserFixnum() * 2;

    let result = 0;
    for (let i = 0; i < x; i++) {
      result += this._getByte() * 256 ** i;

      // console.log(
      //   result.toString(16).toUpperCase().padStart(16, "0"),
      //   result.toString(2).padStart(64, "0")
      // );
    }

    return signd == 0x2b ? result : result * -1;
  }

  private parserClass() {
    this._readStr(this.parserFixnum());
    return this.cache_object({});
  }

  private parserModule() {
    this._readStr(this.parserFixnum());
    return this.cache_object({});
  }

  private parserRegexp() {
    const len = this.parserFixnum();
    const r = this._readStr(len);
    const m = this._getByte();
    let flags = "";

    if (m & (1 << 2)) {
      flags += "m";
    }
    if (m & (1 << 1)) {
      flags += "x";
    }
    if (m & 1) {
      flags += "i";
    }

    return `/${r}/${flags}`;
  }

  private parserStruct() {
    this.parser(); // struct name
    return this.parserHash();
  }

  /**
   *
   * @param ic 是否有自定义成员
   * @returns
   */
  private parserC(ic: boolean) {
    this.parser(); // class name
    if (ic) this.parser(); // 继承的元素
    const r = ic ? this.parserHash() : this.cache_object(this.parser());
    return r;
  }

  private parserExtendObject() {
    this.parser(); // module name
    return this.cache_object(this.parser());
  }

  private parserU() {
    this.parser(); // name
    return this.parser();
  }

  private parser_u() {
    // 自定义的 _dump 数据
    const name = this.parser(); // name
    let size = this.parserFixnum(); // size

    if (
      this.v.getUint8(this.offset) === 0x04 &&
      this.v.getUint8(this.offset + 1) === 0x08
    ) {
      return new RubyMarshal(this.v, ++this.offset).parser();
    } else {
      // 不知道该怎么解析的数据
      const bytes = [];
      while (size--) bytes.push(this._getByte());
      return {
        _dump: name,
        bytes,
      };
    }
  }
}
