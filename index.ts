import * as fs from "fs";
import * as path from "path";
import { RubyMarshal } from "./RubyMarshal";

// debug
// const buf = fs.readFileSync(path.join(__dirname, "..", `Save3.rxdata`));
const buf = fs.readFileSync(`D:\\Games\\NOCTURNE\\SaveData\\Save4.rxdata`);

const uint8arr = new Uint8Array(buf.byteLength);
buf.copy(uint8arr, 0, 0, buf.byteLength);
const v = new DataView(uint8arr.buffer);

const m = new RubyMarshal(v, 2);

const datas = [];
try {
  while (true) {
    const data = m.parser();
    datas.push(data);
  }
} catch (error) {
  console.error(error.message);
  console.log("=======================");

  console.log(
    buf.byteLength.toString(16).toUpperCase(),
    m.offset.toString(16).toUpperCase()
  );
  fs.writeFileSync("./data.json", JSON.stringify(datas, null, "  "));
}
