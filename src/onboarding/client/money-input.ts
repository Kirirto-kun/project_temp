export function parseMoneyInput(text:string):number|null {
  const value=text.trim().replace(/^\$/,'');
  if(!value)return null;
  if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value))throw new Error('Enter a USD amount such as 95,000 or 95000.50, or leave it blank.');
  const [whole,decimal='']=value.split('.');
  const minor=BigInt(whole.replaceAll(',',''))*100n+BigInt(decimal.padEnd(2,'0'));
  if(minor<1n||minor>10_000_000_000n)throw new Error('Enter an amount between $0.01 and $100,000,000.');
  return Number(minor);
}
export function moneyInputValue(minor:number|undefined) {
  if(minor===undefined)return '';
  return (minor/100).toFixed(2).replace(/\.00$/,'');
}
