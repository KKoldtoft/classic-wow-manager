const https = require('https');
const q = `query{reportData{report(code:"nfZVLkWapRdBrH3t"){fights{id,startTime}}}}`;
https.request({
  hostname:'vanilla.warcraftlogs.com',
  path:'/api/v2/client',
  method:'POST',
  headers:{'Content-Type':'application/json','Authorization':'Bearer '+process.env.WCL_CLIENT_ID}
},r=>{
  let d='';
  r.on('data',c=>d+=c);
  r.on('end',()=>{
    try{
      const j=JSON.parse(d);
      console.log('Response:',JSON.stringify(j,null,2).substring(0,500));
      if(!j.data||!j.data.reportData||!j.data.reportData.report){
        console.log('No report data returned');
        return;
      }
      const f=j.data.reportData.report.fights||[];
      console.log('Fights:',f.length);
      if(f.length>0){
        const minStart=Math.min(...f.map(x=>x.startTime));
        console.log('First fight starts at:',minStart,'ms ('+(minStart/60000).toFixed(1)+' min)');
      }
    }catch(e){
      console.log('Error:',e.message);
      console.log('Raw response:',d);
    }
  });
}).end(JSON.stringify({query:q}));
