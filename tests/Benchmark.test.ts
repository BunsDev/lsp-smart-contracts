import fs from "fs";
import { ethers } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Align, getMarkdownTable, Row } from "markdown-table-ts";

import { LSP6KeyManager__factory, UniversalProfile__factory } from "../types";

import { ALL_PERMISSIONS, ERC725YDataKeys, PERMISSIONS } from "../constants";
import { LSP6TestContext } from "./utils/context";
import { setupKeyManager } from "./utils/fixtures";
import {
  combineAllowedCalls,
  combinePermissions,
  encodeCompactBytesArray,
} from "./utils/helpers";

const buildLSP6TestContext = async (): Promise<LSP6TestContext> => {
  const accounts = await ethers.getSigners();
  const owner = accounts[0];

  const universalProfile = await new UniversalProfile__factory(owner).deploy(
    owner.address
  );
  const keyManager = await new LSP6KeyManager__factory(owner).deploy(
    universalProfile.address
  );

  return { accounts, owner, universalProfile, keyManager };
};

let mainControllerSetDataTable;
let restrictedControllerSetDataTable;

describe("⛽ gas costs --> setData(...) via Key Manager", () => {
  let context: LSP6TestContext;

  let controllerCanSetData: SignerWithAddress,
    controllerCanSetDataAndAddPermissions: SignerWithAddress;

  const allowedERC725YDataKeys = [
    ethers.utils.keccak256(ethers.utils.toUtf8Bytes("key1")),
    ethers.utils.keccak256(ethers.utils.toUtf8Bytes("key2")),
    ethers.utils.keccak256(ethers.utils.toUtf8Bytes("key3")),
    ethers.utils.keccak256(ethers.utils.toUtf8Bytes("key4")),
    ethers.utils.keccak256(ethers.utils.toUtf8Bytes("key5")),
    ethers.utils.keccak256(ethers.utils.toUtf8Bytes("key6")),
    ethers.utils.keccak256(ethers.utils.toUtf8Bytes("key7")),
    ethers.utils.keccak256(ethers.utils.toUtf8Bytes("key8")),
    ethers.utils.keccak256(ethers.utils.toUtf8Bytes("key9")),
    ethers.utils.keccak256(ethers.utils.toUtf8Bytes("key10")),
  ];

  before(async () => {
    context = await buildLSP6TestContext();

    controllerCanSetData = context.accounts[1];
    controllerCanSetDataAndAddPermissions = context.accounts[2];

    // prettier-ignore
    const permissionKeys = [
      ERC725YDataKeys.LSP6["AddressPermissions:Permissions"] + context.owner.address.substring(2),
      ERC725YDataKeys.LSP6["AddressPermissions:Permissions"] + controllerCanSetData.address.substring(2),
      ERC725YDataKeys.LSP6["AddressPermissions:AllowedERC725YDataKeys"] + controllerCanSetData.address.substring(2),
      ERC725YDataKeys.LSP6["AddressPermissions:Permissions"] + controllerCanSetDataAndAddPermissions.address.substring(2),
      ERC725YDataKeys.LSP6["AddressPermissions:AllowedERC725YDataKeys"] + controllerCanSetDataAndAddPermissions.address.substring(2),
      ERC725YDataKeys.LSP6["AddressPermissions[]"].length,
      ERC725YDataKeys.LSP6["AddressPermissions[]"].index + "00000000000000000000000000000000",
      ERC725YDataKeys.LSP6["AddressPermissions[]"].index + "00000000000000000000000000000001",
      ERC725YDataKeys.LSP6["AddressPermissions[]"].index + "00000000000000000000000000000002",
    ];

    // // prettier-ignore
    const permissionValues = [
      ALL_PERMISSIONS,
      PERMISSIONS.SETDATA,
      encodeCompactBytesArray(allowedERC725YDataKeys),
      combinePermissions(PERMISSIONS.SETDATA, PERMISSIONS.ADDPERMISSIONS),
      encodeCompactBytesArray(allowedERC725YDataKeys),
      //   ethers.utils.hexZeroPad("0x03", 32),
      "0x0000000000000000000000000000000000000000000000000000000000000003",
      context.owner.address,
      controllerCanSetData.address,
      controllerCanSetDataAndAddPermissions.address,
    ];

    await setupKeyManager(context, permissionKeys, permissionValues);
  });

  describe("main controller (this browser extension) has SUPER_SETDATA ", () => {
    let benchmarkCasesSetDataMainController: Row[] = [];

    it("updates profile details (LSP3Profile metadata)", async () => {
      const dataKey = ERC725YDataKeys.LSP3["LSP3Profile"];
      const dataValue =
        "0x6f357c6a820464ddfac1bec070cc14a8daf04129871d458f2ca94368aae8391311af6361696670733a2f2f516d597231564a4c776572673670456f73636468564775676f3339706136727963455a4c6a7452504466573834554178";

      const setDataPayload =
        context.universalProfile.interface.encodeFunctionData(
          "setData(bytes32,bytes)",
          [dataKey, dataValue]
        );

      const tx = await context.keyManager
        .connect(context.owner)
        ["execute(bytes)"](setDataPayload);
      const receipt = await tx.wait();

      benchmarkCasesSetDataMainController.push([
        "updates profile details (LSP3Profile metadata)",
        receipt.gasUsed.toNumber().toString(),
      ]);
    });

    it(`give permissions to a controller
        1. increase AddressPermissions[] array length
        2. put the controller address at AddressPermissions[index]
        3. give the controller the permission SETDATA under AddressPermissions:Permissions:<controller-address>
    `, async () => {
      const newController = context.accounts[3];

      const AddressPermissionsArrayLength = await context.universalProfile[
        "getData(bytes32)"
      ](ERC725YDataKeys.LSP6["AddressPermissions[]"].length);

      // prettier-ignore
      const dataKeys = [
        ERC725YDataKeys.LSP6["AddressPermissions[]"].length,
        ERC725YDataKeys.LSP6["AddressPermissions[]"].index + ethers.utils.hexZeroPad(ethers.utils.hexStripZeros(AddressPermissionsArrayLength), 16).substring(2),
        ERC725YDataKeys.LSP6["AddressPermissions:Permissions"] + newController.address.substring(2),
      ];

      // prettier-ignore
      const dataValues = [
        ethers.utils.hexZeroPad(ethers.BigNumber.from(AddressPermissionsArrayLength).add(1).toHexString(), 32),
        newController.address,
        combinePermissions(PERMISSIONS.SETDATA, PERMISSIONS.TRANSFERVALUE),
      ];

      const setDataPayload =
        context.universalProfile.interface.encodeFunctionData(
          "setData(bytes32[],bytes[])",
          [dataKeys, dataValues]
        );

      let tx = await context.keyManager
        .connect(context.owner)
        ["execute(bytes)"](setDataPayload);

      let receipt = await tx.wait();

      expect(
        await context.universalProfile["getData(bytes32[])"](dataKeys)
      ).to.deep.equal(dataValues);

      benchmarkCasesSetDataMainController.push([
        "give permissions to a controller (AddressPermissions[] + AddressPermissions[index] + AddressPermissions:Permissions:<controller-address>)",
        receipt.gasUsed.toNumber().toString(),
      ]);
    });

    it("restrict a controller to some specific ERC725Y Data Keys", async () => {
      const controllerToEdit = context.accounts[3];

      const allowedDataKeys = [
        ethers.utils.hexlify(
          ethers.utils.toUtf8Bytes("Allowed ERC725Y Data Key 1")
        ),
        ethers.utils.hexlify(
          ethers.utils.toUtf8Bytes("Allowed ERC725Y Data Key 2")
        ),
        ethers.utils.hexlify(
          ethers.utils.toUtf8Bytes("Allowed ERC725Y Data Key 3")
        ),
      ];

      // prettier-ignore
      const dataKey =
        ERC725YDataKeys.LSP6["AddressPermissions:AllowedERC725YDataKeys"] + controllerToEdit.address.substring(2)

      // prettier-ignore
      const dataValue = 
        encodeCompactBytesArray([allowedDataKeys[0], allowedDataKeys[1], allowedDataKeys[2]])

      const setDataPayload =
        context.universalProfile.interface.encodeFunctionData(
          "setData(bytes32,bytes)",
          [dataKey, dataValue]
        );

      let tx = await context.keyManager
        .connect(context.owner)
        ["execute(bytes)"](setDataPayload);

      let receipt = await tx.wait();

      expect(
        await context.universalProfile["getData(bytes32)"](dataKey)
      ).to.equal(dataValue);

      benchmarkCasesSetDataMainController.push([
        "restrict a controller to some specific ERC725Y Data Keys",
        receipt.gasUsed.toNumber().toString(),
      ]);
    });

    it("restrict a controller to interact only with 3x specific addresses", async () => {
      const controllerToEdit = context.accounts[3];

      const allowedAddresses = [
        context.accounts[4].address,
        context.accounts[5].address,
        context.accounts[6].address,
      ];

      // prettier-ignore
      const dataKey = ERC725YDataKeys.LSP6["AddressPermissions:AllowedCalls"] + controllerToEdit.address.substring(2)

      const dataValue = combineAllowedCalls(
        ["0xffffffff", "0xffffffff", "0xffffffff"],
        [allowedAddresses[0], allowedAddresses[1], allowedAddresses[2]],
        ["0xffffffff", "0xffffffff", "0xffffffff"]
      );

      const setDataPayload =
        context.universalProfile.interface.encodeFunctionData(
          "setData(bytes32,bytes)",
          [dataKey, dataValue]
        );

      let tx = await context.keyManager
        .connect(context.owner)
        ["execute(bytes)"](setDataPayload);

      let receipt = await tx.wait();

      expect(
        await context.universalProfile["getData(bytes32)"](dataKey)
      ).to.equal(dataValue);

      benchmarkCasesSetDataMainController.push([
        "restrict a controller to interact only with 3x specific addresses",
        receipt.gasUsed.toNumber().toString(),
      ]);
    });

    it(`remove a controller (its permissions + its address from the AddressPermissions[] array)
        1. decrease AddressPermissions[] array length
        2. remove the controller address at AddressPermissions[index]
        3. set "0x" for the controller permissions under AddressPermissions:Permissions:<controller-address>
    `, async () => {
      const newController = context.accounts[3];

      const AddressPermissionsArrayLength = await context.universalProfile[
        "getData(bytes32)"
      ](ERC725YDataKeys.LSP6["AddressPermissions[]"].length);

      // prettier-ignore
      const dataKeys = [
        ERC725YDataKeys.LSP6["AddressPermissions[]"].length,
        ERC725YDataKeys.LSP6["AddressPermissions[]"].index + ethers.utils.hexZeroPad(ethers.utils.hexStripZeros(AddressPermissionsArrayLength), 16).substring(2),
        ERC725YDataKeys.LSP6["AddressPermissions:Permissions"] + newController.address.substring(2),
      ];

      // prettier-ignore
      const dataValues = [
        ethers.utils.hexZeroPad(ethers.BigNumber.from(AddressPermissionsArrayLength).sub(1).toHexString(), 32),
        "0x",
        "0x",
      ];

      const setDataPayload =
        context.universalProfile.interface.encodeFunctionData(
          "setData(bytes32[],bytes[])",
          [dataKeys, dataValues]
        );

      let tx = await context.keyManager
        .connect(context.owner)
        ["execute(bytes)"](setDataPayload);

      let receipt = await tx.wait();

      benchmarkCasesSetDataMainController.push([
        "remove a controller (its permissions + its address from the AddressPermissions[] array)",
        receipt.gasUsed.toNumber().toString(),
      ]);
    });

    it("write 5x LSP12 Issued Assets", async () => {
      // prettier-ignore
      const issuedAssetsDataKeys = [
            ERC725YDataKeys.LSP12["LSP12IssuedAssets[]"].length,
            ERC725YDataKeys.LSP12["LSP12IssuedAssets[]"].index + "00000000000000000000000000000000",
            ERC725YDataKeys.LSP12["LSP12IssuedAssets[]"].index + "00000000000000000000000000000001",
            ERC725YDataKeys.LSP12["LSP12IssuedAssets[]"].index + "00000000000000000000000000000002",
            ERC725YDataKeys.LSP12["LSP12IssuedAssets[]"].index + "00000000000000000000000000000003",
            ERC725YDataKeys.LSP12["LSP12IssuedAssets[]"].index + "00000000000000000000000000000004",
        ];

      // these are just random placeholder values
      // they should be replaced with actual token contract address
      const issuedAssetsDataValues = [
        "0x0000000000000000000000000000000000000000000000000000000000000005",
        context.accounts[5].address,
        context.accounts[6].address,
        context.accounts[7].address,
        context.accounts[8].address,
        context.accounts[9].address,
      ];

      const setDataPayload =
        context.universalProfile.interface.encodeFunctionData(
          "setData(bytes32[],bytes[])",
          [issuedAssetsDataKeys, issuedAssetsDataValues]
        );

      let tx = await context.keyManager
        .connect(context.owner)
        ["execute(bytes)"](setDataPayload);

      let receipt = await tx.wait();

      expect(
        await context.universalProfile["getData(bytes32[])"](
          issuedAssetsDataKeys
        )
      ).to.deep.equal(issuedAssetsDataValues);

      benchmarkCasesSetDataMainController.push([
        "write 5x LSP12 Issued Assets",
        receipt.gasUsed.toNumber().toString(),
      ]);
    });

    after(async () => {
      mainControllerSetDataTable = getMarkdownTable({
        table: {
          head: ["`setData` scenarios - 👑 main controller", "⛽ Gas Usage"],
          body: benchmarkCasesSetDataMainController,
        },
        alignment: [Align.Left, Align.Center],
      });
    });
  });

  describe("a controller (EOA) can SETDATA, ADDPERMISSIONS and on 10x AllowedERC725YKeys", () => {
    let benchmarkCasesSetDataRestrictedController: Row[] = [];

    it("`setData(bytes32,bytes)` -> updates 1x data key", async () => {
      const dataKey = allowedERC725YDataKeys[5];
      const dataValue = "0xaabbccdd";

      const setDataPayload =
        context.universalProfile.interface.encodeFunctionData(
          "setData(bytes32,bytes)",
          [dataKey, dataValue]
        );

      const tx = await context.keyManager
        .connect(controllerCanSetData)
        ["execute(bytes)"](setDataPayload);
      const receipt = await tx.wait();

      benchmarkCasesSetDataRestrictedController.push([
        "`setData(bytes32,bytes)` -> updates 1x data key",
        receipt.gasUsed.toNumber().toString(),
      ]);
    });

    it("`setData(bytes32[],bytes[])` -> updates 3x data keys (first x3)", async () => {
      const dataKeys = allowedERC725YDataKeys.slice(0, 3);
      const dataValues = ["0xaabbccdd", "0xaabbccdd", "0xaabbccdd"];

      const setDataPayload =
        context.universalProfile.interface.encodeFunctionData(
          "setData(bytes32[],bytes[])",
          [dataKeys, dataValues]
        );

      const tx = await context.keyManager
        .connect(controllerCanSetData)
        ["execute(bytes)"](setDataPayload);
      const receipt = await tx.wait();

      benchmarkCasesSetDataRestrictedController.push([
        "`setData(bytes32[],bytes[])` -> updates 3x data keys (first x3)",
        receipt.gasUsed.toNumber().toString(),
      ]);
    });

    it("`setData(bytes32[],bytes[])` -> updates 3x data keys (middle x3)", async () => {
      const dataKeys = allowedERC725YDataKeys.slice(3, 6);
      const dataValues = ["0xaabbccdd", "0xaabbccdd", "0xaabbccdd"];

      const setDataPayload =
        context.universalProfile.interface.encodeFunctionData(
          "setData(bytes32[],bytes[])",
          [dataKeys, dataValues]
        );

      const tx = await context.keyManager
        .connect(controllerCanSetData)
        ["execute(bytes)"](setDataPayload);
      const receipt = await tx.wait();

      benchmarkCasesSetDataRestrictedController.push([
        "`setData(bytes32[],bytes[])` -> updates 3x data keys (middle x3)",
        receipt.gasUsed.toNumber().toString(),
      ]);
    });

    it("`setData(bytes32[],bytes[])` -> updates 3x data keys (last x3)", async () => {
      const dataKeys = allowedERC725YDataKeys.slice(7, 10);
      const dataValues = ["0xaabbccdd", "0xaabbccdd", "0xaabbccdd"];

      const setDataPayload =
        context.universalProfile.interface.encodeFunctionData(
          "setData(bytes32[],bytes[])",
          [dataKeys, dataValues]
        );

      const tx = await context.keyManager
        .connect(controllerCanSetData)
        ["execute(bytes)"](setDataPayload);
      const receipt = await tx.wait();

      benchmarkCasesSetDataRestrictedController.push([
        "`setData(bytes32[],bytes[])` -> updates 3x data keys (last x3)",
        receipt.gasUsed.toNumber().toString(),
      ]);
    });

    it("`setData(bytes32[],bytes[])` -> updates 2x data keys + add 3x new controllers (including setting the array length + indexes under AddressPermissions[index])", async () => {
      const dataKeys = [
        allowedERC725YDataKeys[0],
        allowedERC725YDataKeys[1],
        ERC725YDataKeys.LSP6["AddressPermissions:Permissions"] +
          context.accounts[3].address.substring(2),
        ERC725YDataKeys.LSP6["AddressPermissions:Permissions"] +
          context.accounts[4].address.substring(2),
        ERC725YDataKeys.LSP6["AddressPermissions:Permissions"] +
          context.accounts[5].address.substring(2),
      ];

      const dataValues = [
        "0xaabbccdd",
        "0xaabbccdd",
        PERMISSIONS.SETDATA,
        PERMISSIONS.SETDATA,
        PERMISSIONS.SETDATA,
      ];

      const setDataPayload =
        context.universalProfile.interface.encodeFunctionData(
          "setData(bytes32[],bytes[])",
          [dataKeys, dataValues]
        );

      const tx = await context.keyManager
        .connect(controllerCanSetDataAndAddPermissions)
        ["execute(bytes)"](setDataPayload);
      const receipt = await tx.wait();

      benchmarkCasesSetDataRestrictedController.push([
        "`setData(bytes32[],bytes[])` -> updates 2x data keys + add 3x new controllers (including setting the array length + indexes under AddressPermissions[index])",
        receipt.gasUsed.toNumber().toString(),
      ]);
    });

    after(async () => {
      restrictedControllerSetDataTable = getMarkdownTable({
        table: {
          head: [
            "`setData` scenarios - 🛃 restricted controller",
            "⛽ Gas Usage",
          ],
          body: benchmarkCasesSetDataRestrictedController,
        },
        alignment: [Align.Left, Align.Center],
      });
    });
  });

  after(async () => {
    const markdown = `
👋 Hello
⛽ I am the Gas Bot Reporter. I keep track of the gas costs of common interactions using Universal Profiles 🆙 !
📊 Here is a summary of the gas cost with the code introduced by this PR.

<details>
  <summary>⛽ 📊 See Gas Benchmark report</summary>

This document contains the gas usage for common interactions and scenarios when using UniversalProfile smart contracts.

### 🗄️ \`setData\` scenarios

#### 👑 unrestricted controller

${mainControllerSetDataTable}

#### 🛃 restricted controller

${restrictedControllerSetDataTable}


## 📝 Notes

- The \`setData\` scenarios are executed on a fresh UniversalProfile and LSP6KeyManager smart contracts, deployed as standard contracts (not as proxy behind a base contract implementation).


</details>
`;
    const file = "benchmark.md";

    fs.writeFileSync(file, markdown);
  });
});