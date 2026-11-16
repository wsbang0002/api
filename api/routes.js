'use strict';
function send(res,code,data){res.status(code).setHeader('Cache-Control','no-store').json(data)}
function point(p){if(!p||!Number.isFinite(p.lat)||!Number.isFinite(p.lng)||Math.abs(p.lat)>90||Math.abs(p.lng)>180)return null;return {location:{latLng:{latitude:p.lat,longitude:p.lng}}}}
module.exports=async function handler(req,res){
 if(req.method!=='POST')return send(res,405,{error:'POST 요청만 가능합니다.'});
 if(!process.env.GOOGLE_MAPS_API_KEY)return send(res,503,{error:'GOOGLE_MAPS_API_KEY가 설정되지 않았습니다.'});
 const raw=Array.isArray(req.body?.points)?req.body.points:[];
 if(raw.length<2||raw.length>8)return send(res,400,{error:'경로 계산은 실제 위치가 확인된 장소 2~8개를 선택해 주세요.'});
 const points=raw.map(point);if(points.some(p=>!p))return send(res,400,{error:'장소 좌표가 올바르지 않습니다.'});
 const travelMode=req.body?.mode==='DRIVE'?'DRIVE':'WALK';
 const payload={origin:points[0],destination:points[points.length-1],intermediates:points.slice(1,-1),travelMode,languageCode:'ko',units:'METRIC',computeAlternativeRoutes:false};
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),12000);
 try{
  const response=await fetch('https://routes.googleapis.com/directions/v2:computeRoutes',{method:'POST',signal:ctl.signal,headers:{'Content-Type':'application/json','X-Goog-Api-Key':process.env.GOOGLE_MAPS_API_KEY,'X-Goog-FieldMask':'routes.duration,routes.distanceMeters,routes.legs.duration,routes.legs.distanceMeters'},body:JSON.stringify(payload)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){console.error('Routes upstream',response.status,data.error?.status);return send(res,502,{error:'Google Routes 요청 실패: Routes API 활성화·결제 설정을 확인해 주세요.'})}
  const route=data.routes?.[0];if(!route)return send(res,404,{error:'해당 이동수단으로 가능한 경로를 찾지 못했습니다.'});
  return send(res,200,{mode:travelMode,distanceMeters:route.distanceMeters||0,durationSeconds:Math.round(parseFloat(route.duration||'0')),legs:(route.legs||[]).map(l=>({distanceMeters:l.distanceMeters||0,durationSeconds:Math.round(parseFloat(l.duration||'0'))}))});
 }catch(e){console.error('Routes error',e.name);return send(res,502,{error:e.name==='AbortError'?'경로 계산 시간 초과':'경로 계산을 완료하지 못했습니다.'})}finally{clearTimeout(timer)}
};
