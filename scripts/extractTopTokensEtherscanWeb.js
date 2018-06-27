// http://etherscan.io/tokens
function toArray (items) {
  return [].slice.call(items)
}

var rowsHtml = document.querySelectorAll('#ContentPlaceHolder1_divresult tr')
var rows = toArray(rowsHtml).slice(1)
var tokens = rows
  .map(row => row.querySelector(':nth-child(3) h5 a'))
  .map(link => {
    var nameAndSymbolRegex = /([\w\s]+) \((\w+)\)/gi
    var addressRegex = /https?:\/\/etherscan.io\/token\/0x(\w+)/gi
    let nameAndSymbolMatch = nameAndSymbolRegex.exec(link.innerText)
    let addressMatch = addressRegex.exec(link.href)

    let name, symbol, address
    if (nameAndSymbolMatch) {
      name = nameAndSymbolMatch[1]
      symbol = nameAndSymbolMatch[2]
    }
    if (addressMatch) {
      address = '0x' + addressMatch[1]
    }

    if (nameAndSymbolMatch) {
      return {
        name,
        symbol,
        address,
        approve: true,
        etherScanLink: link.href
      }
    }
  })

console.log(tokens)
console.log(JSON.stringify(tokens, null, 2))
