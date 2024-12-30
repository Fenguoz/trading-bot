
import { Swap } from "../swap";
import { getCoinData } from "./api";

export async function pumpFunSwap(
  payerPrivateKey: string,
  mintStr: string,
  decimal: number,
  is_buy: boolean,
  _amount: number,
  gasFee: number,
  _slippage: number,
  isFeeBurn: boolean,
  username: string,
  isToken2022: boolean
) {
  try {
    const coinData = await getCoinData(mintStr);
    if (!coinData) {
      console.error("Failed to retrieve coin data...");
      return;
    }

    // const txId = await Swap(buyer, address, {
    //   amount: parseFloat(userConfig.settingAmount),
    //   slippage: parseFloat(userConfig.settingSlippage),
    //   gas: parseFloat(userConfig.settingGas),
    //   tip: parseFloat(userConfig.settingTip),
    // });

  } catch (error) {
    console.log(" - Swap pump token is failed", error);
  }
}
