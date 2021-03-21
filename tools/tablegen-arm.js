// [AsmJit]
// Machine Code Generation for C++.
//
// [License]
// ZLIB - See LICENSE.md file in the package.

// ============================================================================
// tablegen-arm.js
// ============================================================================

"use strict";

const core = require("./tablegen.js");
const hasOwn = Object.prototype.hasOwnProperty;

const asmdb = core.asmdb;
const kIndent = core.kIndent;
const IndexedArray = core.IndexedArray;
const StringUtils = core.StringUtils;

const FAIL = core.FAIL;

// ============================================================================
// [ArmDB]
// ============================================================================

// Create ARM ISA.
const isa = new asmdb.arm.ISA();

// ============================================================================
// [tablegen.arm.GenUtils]
// ============================================================================

class GenUtils {
  // Get a list of instructions based on `name` and optional `mode`.
  static query(name, mode) {
    const insts = isa.query(name);
    return !mode ? insts : insts.filter(function(inst) { return inst.arch === mode; });
  }

  static archOf(records) {
    var t16Arch = false;
    var t32Arch = false;
    var a32Arch = false;
    var a64Arch = false;

    for (var i = 0; i < records.length; i++) {
      const record = records[i];
      if (record.encoding === "T16") t16Arch = true;
      if (record.encoding === "T32") t32Arch = true;
      if (record.encoding === "A32") a32Arch = true;
      if (record.encoding === "A64") a64Arch = true;
    }

    var s = (t16Arch && !t32Arch) ? "T16" :
            (t32Arch && !t16Arch) ? "T32" :
            (t16Arch &&  t32Arch) ? "Txx" : "---";
    s += " ";
    s += (a32Arch) ? "A32" : "---";
    s += " ";
    s += (a64Arch) ? "A64" : "---";

    return `[${s}]`;
  }

  static featuresOf(records) {
    const exts = Object.create(null);
    for (var i = 0; i < records.length; i++) {
      const record = records[i];
      for (var k in record.extensions)
        exts[k] = true;
    }
    const arr =  Object.keys(exts);
    arr.sort();
    return arr;
  }
}

// ============================================================================
// [tablegen.arm.ArmTableGen]
// ============================================================================

class ArmTableGen extends core.TableGen {
  constructor() {
    super("A64");
  }

  // --------------------------------------------------------------------------
  // [Parse / Merge]
  // --------------------------------------------------------------------------

  parse() {
    const rawData = this.dataOfFile("src/asmjit/arm/a64instdb.cpp");
    const stringData = StringUtils.extract(rawData, "// ${InstInfo:Begin}", "// ${InstInfo:End");

    const re = new RegExp(
      "INST\\(\\s*" +
        // [01] Instruction.
        "(" +
          "[A-Za-z0-9_]+" +
        ")\\s*,\\s*" +

        // [02] Encoding.
        "(" +
          "[^,]+" +
        ")\\s*,\\s*" +

        // [03] OpcodeData.
        "(" +
          "\\([^\\)]+\\)" +
        ")\\s*,\\s*" +

        // [04] RWInfo.
        "(" +
          "[^,]+" +
        ")\\s*,\\s*" +

        // [05] InstructionFlags.
        "(\\s*" +
          "(?:" +
            "(?:" +
              "[\\d]+" +
              "|" +
              "F\\([^\\)]*\\)" +
            ")" +
            "\\s*" +
            "[|]?\\s*" +
          ")+" +
        ")\\s*,\\s*" +

        // --- autogenerated fields ---

        // [06] OpcodeDataIndex.
        "([^\\)]+)" +
        "\\s*,\\s*" +

        // [07] NameDataIndex.
        "([^\\)]+)" +
        "\\s*\\)"
      , "g");

    var m;
    while ((m = re.exec(stringData)) !== null) {
      var enum_ = m[1];
      var name = enum_ === "None" ? "" : enum_.toLowerCase();
      var encoding = m[2].trim();
      var opcodeData = m[3].trim();
      var rwInfo = m[4].trim();
      var instFlags = m[5].trim();

      var displayName = name;
      if (name.endsWith("_v"))
        displayName = name.substring(0, name.length - 2);

      // We have just matched #define INST()
      if (name == "id" &&
          encoding === "encoding" &&
          encodingDataIndex === "encodingDataIndex")
        continue;

      this.addInst({
        id                : 0,               // Instruction id (numeric value).
        name              : name,            // Instruction name.
        displayName       : displayName,     // Instruction name to display.
        enum              : enum_,           // Instruction enum without `kId` prefix.
        encoding          : encoding,        // Opcode encoding.
        opcodeData        : opcodeData,      // Opcode data.
        opcodeDataIndex   : -1,              // Opcode data index.
        rwInfo            : rwInfo,          // RW info.
        flags             : instFlags,       // Instruction flags.

        nameIndex         : -1               // Index to InstDB::_nameData.
      });
    }

    if (this.insts.length === 0 || this.insts.length !== StringUtils.countOf(stringData, "INST("))
      FAIL("ARMTableGen.parse(): Invalid parsing regexp (no data parsed)");

    console.log("Number of Instructions: " + this.insts.length);
  }

  merge() {
    var s = StringUtils.format(this.insts, "", true, function(inst) {
      return "INST(" +
        String(inst.enum            ).padEnd(17) + ", " +
        String(inst.encoding        ).padEnd(19) + ", " +
        String(inst.opcodeData      ).padEnd(86) + ", " +
        String(inst.rwInfo          ).padEnd(10) + ", " +
        String(inst.flags           ).padEnd(26) + ", " +
        String(inst.opcodeDataIndex ).padEnd( 3) + ", " +
        String(inst.nameIndex       ).padEnd( 4) + ")";
    }) + "\n";
    return this.inject("InstInfo", s, this.insts.length * 4);
  }

  // --------------------------------------------------------------------------
  // [Hooks]
  // --------------------------------------------------------------------------

  onBeforeRun() {
    this.load([
      "src/asmjit/arm/a64emitter.h",
      "src/asmjit/arm/a64globals.h",
      "src/asmjit/arm/a64instdb.cpp",
      "src/asmjit/arm/a64instdb.h",
      "src/asmjit/arm/a64instdb_p.h"
    ]);
    this.parse();
  }

  onAfterRun() {
    this.merge();
    this.save();
    this.dumpTableSizes();
  }
}

// ============================================================================
// [tablegen.arm.IdEnum]
// ============================================================================

class IdEnum extends core.IdEnum {
  constructor() {
    super("IdEnum");
  }

  comment(inst) {
    var dbInsts = inst.dbInsts;
    if (!dbInsts) return "";

    var text = GenUtils.archOf(dbInsts);
    var features = GenUtils.featuresOf(dbInsts);

    if (features.length)
      text += " {" + features.join("|") + "}";
    return text;
  }
}

// ============================================================================
// [tablegen.arm.NameTable]
// ============================================================================

class NameTable extends core.NameTable {
  constructor() {
    super("NameTable");
  }
}

// ============================================================================
// [tablegen.arm.EncodingTable]
// ============================================================================

class EncodingTable extends core.Task {
  constructor() {
    super("EncodingTable");
  }

  run() {
    const insts = this.ctx.insts;
    const map = {};

    for (var i = 0; i < insts.length; i++) {
      const inst = insts[i];

      const encoding = inst.encoding;
      const opcodeData = inst.opcodeData.replace(/\(/g, "{ ").replace(/\)/g, " }");

      if (!hasOwn.call(map, encoding))
        map[encoding] = [];

      if (inst.opcodeData === "(_)") {
        inst.opcodeDataIndex = 0;
        continue;
      }

      const opcodeTable = map[encoding];
      const opcodeDataIndex = opcodeTable.length;

      opcodeTable.push({ name: inst.name, data: opcodeData });
      inst.opcodeDataIndex = opcodeDataIndex;
    }

    const keys = Object.keys(map);
    keys.sort();

    var tableSource = "";
    var tableHeader = "";
    var encodingIds = "";

    encodingIds += "enum EncodingId : uint32_t {\n"
    encodingIds += "  kEncodingNone = 0";

    keys.forEach((dataClass) => {
      const dataName = dataClass[0].toLowerCase() + dataClass.substr(1);
      const opcodeTable = map[dataClass];
      const count = opcodeTable.length;

      if (dataClass !== "None") {
        encodingIds += ",\n"
        encodingIds += "  kEncoding" + dataClass;
      }

      if (count) {
        tableHeader += `extern const ${dataClass} ${dataName}[${count}];\n`;

        if (tableSource)
          tableSource += "\n";

        tableSource += `const ${dataClass} ${dataName}[${count}] = {\n`;
        for (var i = 0; i < count; i++) {
          tableSource += `  ${opcodeTable[i].data}` + (i == count - 1 ? " " : ",") + " // " + opcodeTable[i].name + "\n";
        }
        tableSource += `};\n`;
      }
    });

    encodingIds += "\n};\n";

    return this.ctx.inject("EncodingId"         , StringUtils.disclaimer(encodingIds), 0) +
           this.ctx.inject("EncodingDataForward", StringUtils.disclaimer(tableHeader), 0) +
           this.ctx.inject("EncodingData"       , StringUtils.disclaimer(tableSource), 0);
  }
}
// ============================================================================
// [tablegen.arm.CommonTable]
// ============================================================================

class CommonTable extends core.Task {
  constructor() {
    super("CommonTable", [
      "IdEnum",
      "NameTable"
    ]);
  }

  run() {
    //const table = new IndexedArray();

    //for (var i = 0; i < insts.length; i++) {
    //  const inst = insts[i];
    //  const item = "{ " + "0" + "}";
    //  inst.commonIndex = table.addIndexed(item);
    //}

    // return this.ctx.inject("InstInfo", StringUtils.disclaimer(s), 0);
    return 0;
  }
}

// ============================================================================
// [Main]
// ============================================================================

new ArmTableGen()
  .addTask(new IdEnum())
  .addTask(new NameTable())
  .addTask(new EncodingTable())
  .addTask(new CommonTable())
  .run();
