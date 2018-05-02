function getAddressFromName(code, addresses) {
  allAddresses = addresses.filter(
      function(addresses){ return addresses.symbol == code }
  );
  if(allAddresses.length != 1){
  	console.log("could not find unique address for "+code)
	return code;
	}
return allAddresses[0].address;
}


fs = require('fs');
data = fs.readFileSync('./scripts/listOfValueableTokens.txt', 'utf8', function (err,data) {
  if (err) {
    return console.log(err);
  }
});
data = (data.match(/\(.+?\)/g)     // Use regex to get matches
  || []                  // Use empty array if there are no matches
	).map(function(str) {    // Iterate matches
  	return str.slice(1,-1) // Remove the brackets
	})
addresses = JSON.parse(fs.readFileSync('./scripts/tokenAddresses.json', 'utf8', function (err,data) {
  if (err) {
    return console.log(err);
  }
})) 
data = data.map(x => getAddressFromName(x, addresses))
console.log(data)
