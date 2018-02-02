module.exports = {
  port: 8556,
  skipFiles: ['Migrations.sol', 'Utils/Math.sol', 'Utils/Math2.sol', 'Tokens/EtherToken.sol', 'Tokens/StandardToken.sol', 'Oracle/DSAuth.sol', 'Oracle/DSMath.sol', 'Oracle/DSNote.sol', 'Oracle/DSThing.sol', 'Oracle/DSValue.sol', 'Oracle/Medianizer.sol', 'Oracle/PriceFeed.sol'],
  testrpcOptions: '--port 8556 --account=0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d,50000000000000000000000 --account=0x6cbed15c793ce57650b9877cf6fa156fbef513c4e6134f022a85b1ffdd59b2a1,50000000000000000000000 --account=0x6370fd033278c143179d81c5526140625662b8daa446c22ee2d73db3707e620c,50000000000000000000000 --account=0x646f1ce2fdad0e6deeeb5c7e8e5543bdde65e86029e2fd9fc169899c440a7913,50000000000000000000000 --account=0xadd53f9a7e588d003326d1cbf9e4a43c061aadd9bc938c843a79e7b4fd2ad743,50000000000000000000000 --account=0x395df67f0c2d2d9fe1ad08d1bc8b6627011959b79c53d7dd6a3536a33ab8a4fd,50000000000000000000000 --account=0xe485d098507f54e7733a205420dfddbe58db035fa577fc294ebd14db90767a52,50000000000000000000000',
  testCommand: 'truffle test -s',
  copyPackages: ['@gnosis.pm'],
};