'use strict';
const CACHE = new Map();
const TTL = 8 * 60 * 1000;
const CATEGORY = {restaurant:'맛집 식당',cafe:'카페',attraction:'관광 명소',park:'공원'};
function send(res,code,obj){res.status(code).setHeader('Cache-Control','no-store').json(obj)}
function field(x,max){return typeof x==='string'?x.trim().slice(0,max):''}
module.exports = async function handler(req,res){
 if(req.method!=='GET')return send(res,405,{error:'GET 요청만 가능합니다.'});
 const key=process.env.GOOGLE_MAPS_API_KEY;
 if(!key)return send(res,503,{error:'GOOGLE_MAPS_API_KEY가 설정되지 않았습니다.'});
 const destination=field(req.query.destination,100),category=field(req.query.category,20)||'restaurant',query=field(req.query.query,70);
 if(!destination || !CATEGORY[category])return send(res,400,{error:'여행지 또는 검색 유형이 올바르지 않습니다.'});
 const cacheKey=[destination,category,query].join('|').toLowerCase();const old=CACHE.get(cacheKey);
 if(old&&Date.now()-old.ts<TTL)return send(res,200,old.data);
 const payload={textQuery:`${destination} ${query||CATEGORY[category]}`,pageSize:10,languageCode:'ko'};
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
 try{
  // Ratings increase Google Places billing tier. By default request Essentials/Pro name/location fields only.
  const fields='places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri';
  const response=await fetch('https://places.googleapis.com/v1/places:searchText',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':fields},body:JSON.stringify(payload)});
  const raw=await response.json().catch(()=>({}));
  if(!response.ok){console.error('Places upstream',response.status,raw.error?.status);return send(res,502,{error:'Google Places 요청에 실패했습니다. API 활성화·결제·키 제한을 확인해 주세요.'})}
  const places=(Array.isArray(raw.places)?raw.places:[]).filter(p=>p.id&&p.displayName?.text&&Number.isFinite(p.location?.latitude)&&Number.isFinite(p.location?.longitude)).map(p=>({placeId:p.id,name:p.displayName.text,address:p.formattedAddress||'',lat:p.location.latitude,lng:p.location.longitude,googleMapsUri:p.googleMapsUri||`https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(p.id)}`,verified:true,source:'google_places'}));
  const data={places,source:'google_places',note:'Google Places 검색 결과입니다. 실시간 영업 여부·평점은 조회하지 않았습니다.'};
  if(CACHE.size>100)CACHE.clear();CACHE.set(cacheKey,{ts:Date.now(),data});return send(res,200,data);
 }catch(e){console.error('Places error',e.name);return send(res,502,{error:e.name==='AbortError'?'장소 검색 시간 초과':'장소 검색에 실패했습니다.'})}finally{clearTimeout(timer)}
};
