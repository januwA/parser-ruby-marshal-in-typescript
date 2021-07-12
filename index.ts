import * as fs from "fs";
import { kstream } from "ajanuw-kstream";
import { RubyMarshal } from "./RubyMarshal";

// debug
// const buf = fs.readFileSync(path.join(__dirname, "..", `Save3.rxdata`));
const m = new RubyMarshal(kstream.create(`./Save3.rxdata`, 2, true));

const datas = [];
while (!m.ks.eof()) {
  const data = m.parser();
  datas.push(data);
}
console.log(
  m.ks.v.byteLength.toString(16).toUpperCase(),
  m.ks.pos.toString(16).toUpperCase()
);
fs.writeFileSync("./data.json", JSON.stringify(datas, null, "  "));
