'use strict';
const path=require('node:path'),assert=require('node:assert/strict'),{createRequire}=require('node:module');
(async()=>{const pm=path.resolve(process.argv[2]),usersFile=path.join(pm,'@node-red/editor-api/lib/auth/users.js'),req=createRequire(usersFile);
 assert.throws(()=>req('@node-rs/bcrypt'),{code:'MODULE_NOT_FOUND'});
 const bcrypt=req('bcryptjs'),users=require(usersFile),password='package-verification-only';
 users.init({type:'credentials',users:[{username:'package-check',password:await bcrypt.hash(password,4),permissions:'*'}]});
 assert.equal((await users.authenticate('package-check',password)).username,'package-check');assert.equal(await users.authenticate('package-check','incorrect'),null);
 console.log('PASS Node-RED bcryptjs fallback: correct password accepted, wrong password rejected');
})().catch(e=>{console.error(e);process.exitCode=1});
