const speakeasy = require('speakeasy');
const secret = 'EFSXCT3OJQ3EIN2XEFSHIIZZOB2GGTJX';
console.log(speakeasy.totp({
    secret: secret,
    encoding: 'base32'
}));
