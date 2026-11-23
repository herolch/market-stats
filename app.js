'use strict';

// 시장 통계 참고용 화면. 주문·계좌 연동 기능은 없다.
// 범주(환율, 지수, 원자재 …)를 맨 위에서 고르고, 항목을 누르면 그래프가 그 항목으로 바뀐다.
//  - 환율: data/fx/summary.json + data/fx/<통화코드>.json (일별 20년, 시간별 1년)
//  - 시장 지표: data/market/summary.json + data/market/<id>.json (일별 20년)
//    시장 지표의 범주는 summary.json 의 group 값에서 만든다. 수집 항목이 늘면 화면도 따라 늘어난다.
//  - 한국·미국 경제 지표: data/ecos, data/fred (summary.json + <id>.json). 발표 주기는 일·주·월·분기
//  - 부동산 실거래가: data/realty (summary.json + <유형>/<지역코드>.json 의 월별 요약)
//    유형: apt 아파트, rh 연립·다세대, land 토지 / 지역: all 전국, 시도 2자리, 시군구 5자리
//  - 국내 ETF: data/etf/summary.json(전체 순위표용 요약 1개) + data/etf/<코드>.json(누른 종목만 불러옴)
const FX = [
  ['USD','미국 달러',1], ['EUR','유로',1], ['CNY','중국 위안',1], ['JPY','일본 엔',100],
  ['GBP','영국 파운드',1], ['CAD','캐나다 달러',1], ['AUD','호주 달러',1],
  ['NZD','뉴질랜드 달러',1], ['SGD','싱가포르 달러',1], ['HKD','홍콩 달러',1],
  ['CHF','스위스 프랑',1], ['MYR','말레이시아 링깃',1],
  ['PHP','필리핀 페소',1], ['IDR','인도네시아 루피아',100],
  ['THB','태국 바트',1], ['VND','베트남 동',100], ['TWD','대만 달러',1],
  ['INR','인도 루피',1], ['SEK','스웨덴 크로나',1], ['MXN','멕시코 페소',1]
].map(([code,name,unit]) => ({code,name,unit}));
const fxLookup = Object.fromEntries(FX.map(x=>[x.code,x]));
const FX_CAT = 'fx';
const ETF_CAT = 'etf';
const HOME_CAT = 'home';                      // 주요 지표 (처음 화면)
// 주요 지표 칸: [종류, id]. 자료가 없는 항목은 건너뛴다. 칸을 누르면 그 항목의 분류로 옮겨 간다.
// 재배포 원칙 (2026-11-27): Yahoo·네이버·Frankfurter 자료는 게시하지 않는다. 공식 자료로 바꾼다 (없는 항목은 저절로 빠짐).
const HOME_ITEMS = [['fsc','kospi'],['fx','USD'],['ecos','base_rate'],['fred','us10y'],['fred','fedfunds'],
  ['fred','wti'],['worldbank','gold'],['ecos','cpi'],['ecos','unemp_rate'],['ecos','gdp_nominal'],['realty','apt_all']];
const REALTY_CAT = 'realty';                  // 부동산 중분류 id 는 'realty:apt' 처럼 쓴다
const isRealtyCat = c => String(c).startsWith('realty:');
// 시도 순서: 특별시·광역시 → 도 (통계청 관행)
const SIDO_ORDER = ['11','26','27','28','30','31','36','41','51','43','44','52','12','29','46','47','48','50'];   // 12: 전남광주통합특별시(2026.7)
const MACRO = ['ecos','fsc','fred','worldbank','china','pop','customs','deposit','krx','finlife','kamis'];   // fsc: 금융위원회 지수·채권 (2026-11-27), worldbank: 원자재 월별   // krx: KRX 석유시장 도매 거래가 (2026-11-26)
   // bond(채권 발행)는 자료가 2019년에서 끝나 숨김 (2026-11-26)   // 경제 지표 묶음 (한국은행, FRED, 중국, 주민등록 인구, 관세청 수출입)
const MACRO_GROUP = {ecos:'kr',fsc:'fin',fred:'us',worldbank:'intl',china:'cn',pop:'pop',customs:'kr',bond:'fin',deposit:'fin',krx:'kr',finlife:'fin',kamis:'price'};
// 지표 묶음 이름 바꾸기: 관세청 첨단산업 수출입은 한국 경제 → 무역 칸에 함께 둔다
const GROUP_ALIAS = {'한국 첨단산업':'한국 무역','한국 예적금 금리':'예금·대출 금리'};   // 예적금 → 예금·대출 금리 (2026-11-27)
const macroGroup = m => GROUP_ALIAS[m?.group]||m?.group||'기타';
// 범주 이름 바꾸기 (id 는 그대로, 보이는 이름만)
const CAT_LABEL = {'지수':'주가지수'};
const MACRO_DESC = '항목을 누르면 아래 그래프가 바뀝니다. 지표마다 발표 주기(일·주·월·분기)가 다릅니다. 직전 발표 대비와 1년 전 대비는 % 변동이고, 단위가 % 인 지표(금리·성장률)는 %p(두 값의 차이)입니다. 10년 최저는 최근 10년 중 가장 낮은 값이고 괄호 안은 지금 값과의 차이입니다.';
// 부동산 지표: [키, 이름, 단위, 같은 종류의 건수 키]
const REALTY_METRICS = {
  house:[['trade_ppm','매매 ㎡당','만원/㎡','trade_n'],['jeonse_ppm','전세 ㎡당','만원/㎡','jeonse_n'],
         ['trade_n','매매 건수','건',null],['jeonse_n','전세 건수','건',null]],
  land:[['trade_ppm','토지 ㎡당','만원/㎡','trade_n'],['trade_n','거래 건수','건',null]],
};
const id = (x) => document.getElementById(x);

function safeGet(k){try{return localStorage.getItem(k)}catch(_){return null}}
function safeSet(k,v){try{localStorage.setItem(k,v)}catch(_){}}
function safeRemove(k){try{localStorage.removeItem(k)}catch(_){}}

function parseSel(text){
  const m=/^(fx|market|etf|fred|ecos|china|pop|customs|bond|deposit|realty|finlife|kamis):([A-Za-z0-9_]+)$/.exec(text||'');
  return m?{kind:m[1],id:m[2]}:null;
}
const state = {
  // 처음 열 때는 늘 주요 지표·코스피로 시작한다. 지난번에 누른 항목은 기억하지 않는다.
  cat: HOME_CAT,                                       // 고른 범주
  sel: {kind:'fsc',id:'kospi'},                     // 그래프에 그릴 항목
  fx: null,                                            // data/fx/summary.json
  market: null,                                        // data/market/summary.json
  etf: null,                                           // data/etf/summary.json
  fred: null, ecos: null, realty: null,                // 미국·한국 경제 지표, 서울 아파트 실거래가
  realtyMetric: 'trade_ppm',                           // 처음엔 늘 매매 ㎡당 (지난 선택은 기억하지 않음)
  realtySido: null,                                    // 펼친 시도 (null 이면 전국·시도 칸)
  etfTab: safeGet('etfTab') ?? 'fav',                  // 펼친 ETF 분류 ('fav' 관심, 'all' 전체, '1'~'7' 분류, '' 닫힘)
  etfSort: safeGet('etfSort') || 'd1',                 // ETF 순위 기준
  etfDesc: safeGet('etfDesc') !== 'asc',               // true 면 높은 순
  etfQuery: '',                                        // ETF 검색어
  etfShow: 20,                                         // 순위표에 보이는 줄 수
  data: null,                                          // 고른 항목의 시계열 파일
  dailyYears: 10,
  hourlyDays: 365,       // 단기 보기 기간(일). 7, 30, 90, 180, 365
  hoverP: null,          // 터치한 가로 위치(0~1)
  hoverChart: null,      // 터치한 곳에 가까운 선('daily' 또는 'hourly'). 그 선에만 동그라미를 그린다
  combo: null,
  expanded: false,       // 현황 목록을 모두 펼쳤는지
  requestId: 0,
};
if (state.sel.kind==='fx' && !fxLookup[state.sel.id]) state.sel = {kind:'fx',id:'USD'};

const parsedTimestamp = x => {
  const ms = Date.parse(x);
  return Number.isFinite(ms) ? ms : NaN;
};
const inKorea = (time, withTime=false) => {
  if (!time || !Number.isFinite(parsedTimestamp(time))) return '—';
  return new Intl.DateTimeFormat('ko-KR',{
    timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',
    ...(withTime ? {hour:'2-digit',minute:'2-digit',hour12:false} : {})
  }).format(new Date(time));
};
// 음수도 있는 값(금리차, 경상수지 등)과 큰 값을 적는다.
function prettyValue(value){
  const v=Number(value);
  if(typeof value!=='number'||!Number.isFinite(v))return '—';
  const a=Math.abs(v);
  const digits=a>=10000?0:a>=1000?1:a<1?3:2;
  return v.toLocaleString('ko-KR',{minimumFractionDigits:digits,maximumFractionDigits:digits});
}
function prettyRate(value) {
  const v = Number(value);
  if (!(v > 0) || !Number.isFinite(v)) return '—';
  const digits = v < 1 ? 4 : (v < 10 ? 3 : 2);
  return v.toLocaleString('ko-KR', {minimumFractionDigits:digits,maximumFractionDigits:digits});
}
const validNumber = v => typeof v === 'number' && Number.isFinite(v) && v>0;
function pct(v){
  return (typeof v==='number'&&Number.isFinite(v))?`${v>0?'+':''}${v.toFixed(2)}%`:'—';
}
// 금리처럼 단위가 % 인 항목은 변동을 %p(퍼센트포인트: 두 % 값의 차이)로 적는다.
function pointText(v){
  return (typeof v==='number'&&Number.isFinite(v))?`${v>0?'+':''}${v.toFixed(2)}%p`:'—';
}
function signClass(v){
  return (typeof v==='number'&&Number.isFinite(v))?(v>0?'up':v<0?'down':''):'';
}

// 큰 자료(부동산 가격 분포·검색용 단지 목록)는 gzip 으로 압축해 게시한다 (2026-11-27, 게시 용량 줄이기).
// <파일>.json.gz 를 받아 브라우저에서 푼다. 없거나 풀 수 없으면 압축 안 한 파일을 받는다.
const GZ_PATH=/\/data\/realty\/dist\/(?!index\.json$).+\.json$|\/data\/search\/places\.json$/;
async function requestGz(path){
  const res=await fetch(path+'.gz?v='+Date.now(),{cache:'no-store'});
  if(!res.ok)throw new Error(`HTTP ${res.status}`);
  const buf=new Uint8Array(await res.arrayBuffer());
  if(buf[0]!==0x1f||buf[1]!==0x8b)return JSON.parse(new TextDecoder().decode(buf));   // 서버가 이미 풀어 준 경우
  const out=new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip')));
  return JSON.parse(await out.text());
}
async function requestJSON(path) {
  if(GZ_PATH.test(path)&&typeof DecompressionStream!=='undefined'){try{return await requestGz(path)}catch(e){}}
  const target = path + (path.includes('?')?'&':'?') + 'v=' + Date.now();
  const res = await fetch(target,{cache:'no-store'});
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

// ---------------- 범주와 항목 ----------------
function fxItem(c){
  return {kind:'fx',id:c.code,cat:FX_CAT,name:`${c.name} ${c.code}`,
    title:`${c.code}${c.unit>1?' '+c.unit:''} · ${c.name}`,
    mult:c.unit,unit:`원 / ${c.unit} ${c.code}`,suffix:'원',file:`./data/fx/${c.code}.json`};
}
function marketItem(key,m){
  return {kind:'market',id:key,cat:m?.group||'기타',name:m?.name||key,
    title:`${m?.name||key} · ${m?.unit||''}`,
    mult:1,unit:m?.unit||'',suffix:m?.unit?' '+m.unit:'',file:`./data/market/${key}.json`};
}
function etfItem(code){
  const e=state.etf?.items?.[code];
  return {kind:'etf',id:code,cat:ETF_CAT,name:`${e?.n||code} ${code}`,
    title:`${e?.n||code} · ${code}`,mult:1,unit:'원',suffix:'원',file:`./data/fsc/etf/${code}.json`};   // 2026-11-27: 금융위원회 자료
}
// 관심 ETF: 별표로 고른 종목. 이 브라우저에만 저장한다. 고른 것이 없으면 시가총액 상위 4개를 보인다.
function etfFavs(){
  try{const v=JSON.parse(safeGet('etfFav')||'null');if(Array.isArray(v))return v.filter(c=>state.etf?.items?.[c])}catch(_){}
  return null;
}
function etfDefault(){
  return Object.entries(state.etf?.items||{}).sort((a,b)=>(b[1].ms||0)-(a[1].ms||0)).slice(0,4).map(([c])=>c);
}
function etfShown(){
  const list=[...(etfFavs()??etfDefault())];
  if(state.sel.kind==='etf'&&state.etf?.items?.[state.sel.id]&&!list.includes(state.sel.id))list.push(state.sel.id);
  return list;
}
function toggleFav(code){
  const list=[...(etfFavs()??etfDefault())];
  const i=list.indexOf(code);
  if(i>=0)list.splice(i,1);else list.push(code);
  safeSet('etfFav',JSON.stringify(list));
  renderTiles();renderEtf();renderPicker();
}
function macroItem(kind,key,m){
  return {kind,id:key,cat:'macro:'+macroGroup(m),name:m?.name||key,
    title:`${m?.name||key} · ${m?.freq_name||''}`,mult:1,unit:m?.unit||'',suffix:m?.unit&&!/^\d/.test(m.unit)?' '+m.unit:'',
    freq:m?.freq||'D',file:`./data/${kind}/${key}.json`};
}
function realtyMetrics(type){return REALTY_METRICS[type==='land'?'land':'house']}
function realtyMetric(type){const list=realtyMetrics(type);return list.find(r=>r[0]===state.realtyMetric)||list[0]}
function regionName(code){
  const s=state.realty||{};
  if(code==='all')return '전국';
  if(code.length===2)return s.sido?.[code]||code;
  return s.regions?.[code]||code;
}
// 부동산 항목: id 는 '<유형>_<지역코드>' (예: apt_11, rh_41135)
function realtyItem(type,region){
  const met=realtyMetric(type);
  const label=region.length===5?`${regionName(region.slice(0,2))} ${regionName(region)}`:regionName(region);
  return {kind:'realty',id:`${type}_${region}`,type,region,cat:'realty:'+type,name:label,title:`${regionName(region)} · ${met[1]}`,
    mult:1,unit:met[2],suffix:' '+met[2],freq:'M',file:`./data/realty/${type}/${region}.json`};
}
function realtyFromId(rid){const [type,region]=String(rid).split('_');return realtyItem(type,region||'all')}
function categories(){
  // 세부 범주 목록. group 은 맨 위 범주 줄의 큰 묶음이다 (GROUPS).
  // 국제 경제: 환율과 시장 지표(원자재, 농산물 …). 주가 지수는 금융시장으로,
  // 시장 지표의 '금리'(미국 국채)는 '미국 금리' 칸에 합치고, 한국·미국·중국 금리는 모두 금융 시장으로 보낸다.
  const list=[{id:HOME_CAT,label:'주요 지표',group:'home'}];
  if(Object.keys(state.fx?.currencies||{}).length)list.push({id:FX_CAT,label:'환율',group:'intl'});   // 게시된 환율 자료가 있을 때만
  const add=(c)=>{if(!list.some(x=>x.id===c.id))list.push(c)};
  for(const m of Object.values(state.market?.items||{})){
    const g=marketCat(m);
    if(g.startsWith('macro:'))continue;               // 미국 금리 칸에 함께 들어간다
    add({id:g,label:CAT_LABEL[g]||g,group:g==='지수'?'fin':'intl'});
  }
  if(state.pop)add({id:PMAP_CAT,label:'인구 지도',group:'pop'});   // 인구 동향: 네모 지도가 첫 중분류
  for(const kind of MACRO){
    for(const m of Object.values(state[kind]?.items||{})){
      const name=macroGroup(m);
      if(kind==='pop'){add({id:'macro:'+name,label:'인구 추이',group:'pop'});continue}
      if(/ 금리$/.test(name)||name==='한국 채권'){add({id:'macro:'+name,label:name,group:'fin'});continue}   // 한국·미국·중국 금리는 모두 금융 시장
      if(name==='한국 주가지수(금융위)'){add({id:'macro:'+name,label:'국내 지수',group:'fin'});continue}
      if(name.startsWith('생활 물가 ')){add({id:'macro:'+name,label:name.slice(6),group:'price'});continue}   // 생활 물가 (KAMIS, 2026-11-27)
      if(name.startsWith('국제 ')){add({id:'macro:'+name,label:name.slice(3),group:'intl'});continue}   // FRED 원자재·달러, 세계은행
      if(TRADE_GROUPS[name]){add({id:'macro:'+name,label:TRADE_GROUPS[name],group:'trade'});continue}   // 무역·투자 대분류 (2026-11-26)
      add({id:'macro:'+name,label:name.replace(/^(한국|미국|중국) /,''),group:MACRO_GROUP[kind]});
    }
  }
  for(const [type,label] of Object.entries(state.realty?.types||{}))
    if(Object.keys(state.realty?.items?.[type]||{}).length)list.push({id:'realty:'+type,label:label+' 통계',group:'realty',hidden:true});   // '지역 통계'는 없앰 (2026-11-26): 전세가율 등은 가격 칸을 누르면 보임   // 예전 요약 화면은 '지역 통계' 하나로 (종류는 화면 안 단추)
  if(Object.keys(state.realty?.items||{}).length){list.push({id:RMAP_CAT,label:'가격',group:'realty'});
    list.push({id:'hub:supply',label:'공급',group:'realty'},{id:'hub:stock',label:'재고',group:'realty'})}   // 부동산 중분류: 가격 · 공급 · 재고 (건축HUB)   // 부동산 중분류: 가격(소분류는 화면 안 단추). 인허가·대장·사용량은 건축HUB 연결 뒤
  if(Object.keys(state.etf?.items||{}).length)list.push({id:ETF_CAT,label:'ETF',group:'fin'});
  if(state.fsc?.latest?.stock)list.push({id:SMAP_CAT,label:'주식',group:'fin'});
  if(state.customs)list.push({id:TMAP_CAT,label:'수출입 지도',group:'trade'});
  list.push({id:WTO_CAT,label:'무역',group:'intl',hidden:!state.wtoReady});   // 국제 무역 (WTO, 2026-11-27)   // 수출입 지도 (관세청, 2026-11-27)
  if(state.inc?.hh||state.inc?.assets||state.inc?.region)for(const [cid,lab,src] of INC_CATS)if(state.inc[src])list.push({id:cid,label:lab,group:'income'});   // 소득·자산 (KOSIS, 2026-11-27)   // 주식 (금융위원회, 2026-11-27)
  return list;
}
// 맨 위 범주 줄: 큰 묶음. 묶음 안의 세부 범주는 현황 제목 아래 작은 단추로 고른다.
// 시장 지표 항목의 세부 범주 id. 미국 국채 금리는 미국 경제의 '금리' 칸으로 옮긴다.
function marketCat(m){const g=m?.group||'기타';return g==='금리'?'macro:미국 금리':g}
const CAT_ROWS=[['intl','us','cn','kr','income'],['fin','realty','price','trade','pop']];   // 아래 줄: 금융 시장 · 부동산 시장 · (생활 물가) · 무역·투자 · 인구 동향
// 무역·투자 (2026-11-26): 한국 경제의 무역·국제투자 칸을 옮겨 온다. 네모 지도(수출입·외국인 투자·해외 투자)는 자료 경로를 정한 뒤
const TRADE_GROUPS={'한국 무역':'수출입','한국 국제투자':'투자'};
const GROUPS=[['home','주요 지표'],['intl','국제 경제'],['us','미국 경제'],['cn','중국 경제'],['kr','한국 경제'],['income','소득·자산'],['fin','금융 시장'],['pop','인구 동향'],['realty','부동산 시장'],['price','생활 물가'],['trade','무역·투자']];
function groupOf(cat){return categories().find(c=>c.id===cat)?.group||'intl'}
// 중분류는 가나다 순으로 늘어놓는다
const SUB_ORDER={income:['inc:hh','inc:assets','inc:region','inc:earned'],price:['macro:생활 물가 채소','macro:생활 물가 과일','macro:생활 물가 곡물','macro:생활 물가 축산','macro:생활 물가 수산'],realty:['rmap:price','hub:supply','hub:stock'],trade:['tmap:trade','macro:한국 무역','macro:한국 국제투자']};
function subsOf(group){const first={realty:RMAP_CAT,pop:PMAP_CAT}[group];const ord=SUB_ORDER[group];
  return categories().filter(c=>c.group===group&&!c.hidden).sort((a,b)=>ord?ord.indexOf(a.id)-ord.indexOf(b.id):first?(a.id===first?-1:b.id===first?1:0):a.label.localeCompare(b.label,'ko'))}
const lastSub={};                                     // 묶음마다 마지막으로 본 세부 범주 (이번 방문 동안만)
function homeItem(kind,key){
  if(kind==='fx')return fxLookup[key]&&state.fx?.currencies?.[key]?fxItem(fxLookup[key]):null;
  if(kind==='market'){const m=state.market?.items?.[key];return m?marketItem(key,m):null}
  if(kind==='realty'){const it=realtyFromId(key);return state.realty?.items?.[it.type]?.[it.region]?it:null}
  const m=state[kind]?.items?.[key];
  return m&&m.count?macroItem(kind,key,m):null;
}
function itemsOf(cat){
  if(cat===HOME_CAT)return HOME_ITEMS.map(([k,key])=>homeItem(k,key)).filter(Boolean);
  if(cat===FX_CAT)return FX.map(fxItem);
  if(cat===ETF_CAT)return etfShown().map(etfItem);
  if(isRealtyCat(cat)){
    // 시도를 펼치지 않았으면 전국 + 시도, 펼쳤으면 그 시도 + 그 안의 시군구
    const type=cat.slice(7),have=state.realty?.items?.[type]||{};
    const sd=state.realtySido;
    const codes=sd?[sd,...Object.keys(have).filter(c=>c.length===5&&c.startsWith(sd)).sort()]
                  :['all',...SIDO_ORDER.filter(c=>have[c])];
    return codes.filter(c=>have[c]).map(c=>realtyItem(type,c));
  }
  if(cat.startsWith('macro:')){
    const g=cat.slice(6),out=[];
    for(const [k,m] of Object.entries(state.market?.items||{}))if(marketCat(m)===cat)out.push(marketItem(k,m));
    for(const kind of MACRO)for(const [k,m] of Object.entries(state[kind]?.items||{}))if(macroGroup(m)===g){
      if(kind==='finlife'&&!(m.how==='mean'&&m.col==='b'&&(m.term===12||m.term==='F'||m.term==='avg')))continue;   // 칸에는 대표 통계만 (나머지는 비교 표에)
      if(kind==='finlife'&&m.set==='all'&&(m.kind==='dep'||m.kind==='sav')&&state.finlife?.items?.[k.replace(/^(bank|sb)_/,'$1g_')])continue;   // 칸은 일반 상품 값 (2026-11-28)
      const kfR=kind==='deposit'&&!!state.deposit?.items?.kfccr_dep12_median;   // 새마을금고 칸은 지역 금고 중앙값 (2026-11-28 v0.6)
      if(kind==='deposit'&&kfR&&/^kfcc[gr]?_/.test(k)){if(!/^kfccr_(dep|sav)12_median$/.test(k))continue}
      else if(kind==='deposit'&&!/_(dep|sav)12_mean$/.test(k))continue;
      if(kind==='deposit'&&/^(cu|kfcc)_/.test(k)&&state.deposit?.items?.[k.replace(/^(cu|kfcc)_/,'$1g_')])continue;
      if(kind==='ecos'&&/_old$/.test(k))continue;   // 끝난 옛 계열(예: M2 1986~2004)은 칸에서 뺌 — 파일은 남김
      out.push(macroItem(kind,k,m));
    }
    if(g==='예금·대출 금리'){const ko=['ecos','finlife','deposit'];out.sort((a,b)=>ko.indexOf(a.kind)-ko.indexOf(b.kind))}
    // 미국 금리: 정책금리 → 국채 만기 순 → 금리차·대출·가산금리 순으로 늘어놓는다
    const order=['fedfunds','us3m','us2y','us5y','us10y','us30y','t10y2y','mortgage30','hy_spread'];
    if(g==='미국 금리')out.sort((a,b)=>(order.indexOf(a.id)+99)%99-(order.indexOf(b.id)+99)%99);
    return out;
  }
  return Object.entries(state.market?.items||{}).filter(([,m])=>marketCat(m)===cat).map(([k,m])=>marketItem(k,m));
}
function catOfSel(kind,key){
  if(kind==='fx')return FX_CAT;
  if(kind==='etf')return ETF_CAT;
  if(kind==='realty')return 'realty:'+String(key).split('_')[0];
  if(MACRO.includes(kind))return 'macro:'+macroGroup(state[kind]?.items?.[key]);
  return marketCat(state.market?.items?.[key]);
}
function currentItem(){
  if(state.sel.kind==='fx')return fxItem(fxLookup[state.sel.id]||fxLookup.USD);
  if(state.sel.kind==='etf')return etfItem(state.sel.id);
  if(state.sel.kind==='stock')return stockItem(state.sel.id);
  if(state.sel.kind==='realty')return realtyFromId(state.sel.id);
  if(MACRO.includes(state.sel.kind))return macroItem(state.sel.kind,state.sel.id,state[state.sel.kind]?.items?.[state.sel.id]);
  return marketItem(state.sel.id,state.market?.items?.[state.sel.id]);
}

function latestFor(code){
  const item=state.fx?.currencies?.[code];
  if(!item)return null;
  if(item.latest && validNumber(item.latest.rate))return {...item.latest,indicative:true};
  if(item.daily_last && validNumber(item.daily_last[1])){
    return {time:item.daily_last[0],rate:item.daily_last[1],indicative:false};
  }
  return null;
}
// 항목 칸에 적을 값: 현재 값, 전일 대비, 주·월·년 변동.
function quoteOf(item){
  if(item.kind==='fx'){
    const cur=state.fx?.currencies?.[item.id];
    const latest=latestFor(item.id);
    const live=cur?.latest?.change;                    // 참고 시세의 전일(한국 날짜) 마지막 값 대비
    return {value:latest?latest.rate*item.mult:null,
      d1:(typeof live==='number'&&Number.isFinite(live))?live:cur?.changes?.d1,avg:cur?.avg_changes};
  }
  if(MACRO.includes(item.kind)){
    // 경제 지표: 직전 발표 대비, 1년 전 대비, 10년 최저. 단위가 % 인 지표는 %p
    const m=state[item.kind]?.items?.[item.id];
    const fmt=m?.absolute?pointText:pct;
    return {value:m?.last?.[1]??null,d1:m?.chg_prev,format:fmt,valueFormat:prettyValue,dayLabel:['직전 발표 대비','직전'],
      cells:[['1년 전 대비',m?.chg_year,fmt],['10년 최저',m?.lo10,fmt,m?.lo10_value],['기준 시점',asOfText(m?.last?.[0],m?.freq)]]};
  }
  if(item.kind==='realty'){
    // 부동산: 신고가 마감된 달(두 달 전)의 값. 칸 안의 숫자는 모두 고른 지표(매매 또는 전세)의 것이다.
    const r=state.realty?.items?.[item.type]?.[item.region]||{};const met=realtyMetric(item.type);
    const cnt=v=>typeof v==='number'?v.toLocaleString('ko-KR')+'건':'—';
    const num=v=>typeof v==='number'?prettyValue(v):'—';
    const int=v=>Math.round(v).toLocaleString('ko-KR');
    const range=(lo,hi)=>typeof lo==='number'&&typeof hi==='number'?`${int(lo)}~${int(hi)}`:'—';
    const place=v=>typeof v!=='number'?'—':v>=50?`상위 ${100-v}%`:`하위 ${v}%`;
    const per=(v,u)=>typeof v==='number'?`${v.toLocaleString('ko-KR')}${u}`:'—';
    // v0.4 세부 지표: 가격 범위(가운데 50%), 전국 대비, 10년 중 위치, 전세가율, 거래량 수준
    let cells;
    if(item.type==='land'&&met[0]==='trade_ppm')
      cells=[['대지',r.ppm_dae,num],['전',r.ppm_jeon,num],['답',r.ppm_dap,num],['임야',r.ppm_imya,num]];
    else if(met[0]==='trade_ppm')
      cells=[['가격 범위',range(r.trade_p25,r.trade_p75)],['전국 대비',typeof r.rel_ppm==='number'?int(r.rel_ppm):'—'],['10년 중 위치',place(r.rel_pct)],['거래 건수',r.trade_n,cnt]];
    else if(met[0]==='jeonse_ppm')
      cells=[['가격 범위',range(r.jeonse_p25,r.jeonse_p75)],['전세가율',per(r.jeonse_ratio,'%')],['거래 건수',r.jeonse_n,cnt],['1년 전',r.jeonse_ppm_ly,num]];
    else
      cells=[['1년 전 같은 달',r[met[0]+'_ly'],cnt],['거래량 수준',per(r[met[0]+'_act'],'')],['기준 월',(state.realty?.settled_month||'').replace('-','.')]];
    return {value:r[met[0]]??null,d1:r[met[0]+'_yoy'],format:pct,valueFormat:met[3]?prettyValue:(v=>typeof v==='number'?v.toLocaleString('ko-KR'):'—'),
      dayLabel:['전년 같은 달 대비','전년'],cells};
  }
  if(item.kind==='etf'){
    const e=state.etf?.items?.[item.id];
    return {value:e?.p??null,d1:e?.d1,avg:e?{w:e.w,m:e.m,y:e.y,lo10:e.lo,lo10_value:e.lv}:null};
  }
  const m=state.market?.items?.[item.id];
  if(m?.unit==='%'&&m.diffs)return {value:m.last?.[1]??null,d1:m.diffs.d1,avg:m.avg_diffs,format:pointText};
  return {value:m?.last?.[1]??null,d1:m?.changes?.d1,avg:m?.avg_changes};
}

function asOfText(d,freq){
  if(!d)return '—';
  const [y,m,dd]=d.split('-');
  if(freq==='A')return `${y}년`;
  if(freq==='Q')return `${y.slice(2)}년 ${Math.floor((Number(m)-1)/3)+1}분기`;
  if(freq==='M')return `${y.slice(2)}.${m}월`;
  return `${y.slice(2)}.${m}.${dd}`;
}

// ---------------- 조작 ----------------
function initControls(){
  id('refresh-button').addEventListener('click',()=>refresh());
  id('home-button')?.addEventListener('click',()=>selectCategory(HOME_CAT));
  id('list-more').addEventListener('click',()=>{state.expanded=!state.expanded;renderTiles()});
  id('item-select').addEventListener('change',e=>{
    const [kind,key]=e.target.value.split(':');
    const cat=catOfSel(kind,key);
    const item=kind==='etf'?etfItem(key):itemsOf(cat).find(i=>i.kind===kind&&i.id===key);
    if(!item)return;
    if(cat!==state.cat){state.cat=cat;state.expanded=false;renderCategories();renderStatus()}
    selectItem(item);
  });
  for(const btn of document.querySelectorAll('[data-chart][data-period]')){
    btn.addEventListener('click',()=>{
      const chart=btn.dataset.chart;
      const n=Number(btn.dataset.period);
      if(chart==='daily')state.dailyYears=n;
      else state.hourlyDays=n;
      state.hoverP=null;
      document.querySelectorAll(`[data-chart="${chart}"]`).forEach(el=>el.classList.toggle('active',el===btn));
      renderCombo();
    });
  }
  id('target-save').addEventListener('click',()=>{
    const raw=Number(id('target-input').value);
    if(!Number.isFinite(raw) || raw<=0){
      id('target-hint').textContent='0보다 큰 값을 입력해 주세요.';
      return;
    }
    safeSet(targetKey(),String(raw));
    id('target-hint').textContent='이 기기의 브라우저에 기준선을 저장했습니다. 주문 또는 알림은 실행되지 않습니다.';
    renderCombo();
  });
  id('target-clear').addEventListener('click',()=>{
    safeRemove(targetKey());
    if(state.sel.kind==='fx')safeRemove('fxTarget:'+state.sel.id);
    id('target-input').value='';
    id('target-hint').textContent='기준선을 지웠습니다.';
    renderCombo();
  });
  initEtfControls();
  let lastCols=0;
  window.addEventListener('resize',()=>{
    renderCombo();
    const cols=(getComputedStyle(id('currency-grid')).gridTemplateColumns||'').split(' ').length;
    if(cols!==lastCols&&state.cat!==ETF_CAT){lastCols=cols;renderTiles()}
  });
  const canvas=id('combo-chart');
  canvas.addEventListener('pointermove',onPointer);
  canvas.addEventListener('pointerdown',onPointer);
  // 터치 화면에서는 손가락을 떼도 표시를 남긴다. 마우스는 그래프를 벗어나면 지운다.
  canvas.addEventListener('pointerleave',e=>{if(e.pointerType==='touch')return;state.hoverP=null;renderCombo()});
  canvas.addEventListener('keydown',e=>{
    if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;
    e.preventDefault();
    const old=state.hoverP ?? 0.5;
    state.hoverP=Math.max(0,Math.min(1,old+(e.key==='ArrowLeft'?-0.01:0.01)));
    renderCombo();
  });
  canvas.tabIndex=0;
  // 그래프 바깥을 누르면 터치 표시(동그라미와 값)를 지운다.
  document.addEventListener('pointerdown',e=>{
    if(state.hoverP===null||e.target===canvas)return;
    state.hoverP=null;state.hoverChart=null;renderCombo();
  });
}

function targetKey(){return `target:${state.sel.kind}:${state.sel.id}`}
function targetValue(){
  const stored=safeGet(targetKey()) ?? (state.sel.kind==='fx'?safeGet('fxTarget:'+state.sel.id):null);
  const n=Number(stored);
  return n>0 && Number.isFinite(n)?n:null;
}

// 범주를 고르면 목록이 바뀌고, 그래프는 그 범주의 첫 항목으로 바뀐다.
function selectCategory(cat){
  if(!categories().some(c=>c.id===cat))cat=HOME_CAT;
  state.cat=cat;state.expanded=false;lastSub[groupOf(cat)]=cat;state.realtySido=null;
  renderCategories();renderStatus();renderEtf();
  const items=itemsOf(cat);
  if(items.length && !items.some(i=>i.kind===state.sel.kind&&i.id===state.sel.id))selectItem(items[0]);
  else renderTiles();
}
function selectItem(item){
  state.sel={kind:item.kind,id:item.id};state.hoverP=null;state.data=null;
  const t=targetValue();
  id('target-input').value=t?String(t):'';
  id('target-title').textContent=item.kind==='fx'?'내 관심 환율':'내 관심 가격';
  id('target-label').textContent=`기준선 입력 (${item.unit})`;
  if(item.kind==='etf')renderEtf();
  id('target-hint').textContent='기준선은 이 브라우저에만 저장됩니다. 매매나 알림은 실행하지 않습니다.';
  renderSelected();renderTiles();renderCombo();
  loadItem(item);
}

// ---------------- 화면 ----------------
function renderCategories(){
  const bar=id('cat-bar');bar.replaceChildren();
  const cur=groupOf(state.cat);
  const hb=id('home-button');                        // 주요 지표 단추는 이름 아래에 따로 둔다
  if(hb){hb.className=cur==='home'?'home-button active':'home-button';hb.setAttribute('aria-pressed',cur==='home'?'true':'false')}
  // 대분류 두 줄 (2026-11-26): 위 줄 경제(국제·미국·중국·한국), 아래 줄 시장·인구(금융·부동산·인구 동향). 주요 지표 단추는 이름 아래에 따로
  for(const row of CAT_ROWS){
   const line=document.createElement('div');line.className='cat-row';bar.appendChild(line);
   for(const g of row){
    const label=GROUPS.find(x=>x[0]===g)?.[1]||g;
    const subs=subsOf(g);
    if(!subs.length)continue;
    const btn=document.createElement('button');btn.type='button';btn.textContent=label;
    btn.className=g===cur?'active':'';
    btn.setAttribute('aria-pressed',g===cur?'true':'false');
    btn.addEventListener('click',()=>{
      const want=lastSub[g];
      selectCategory(subs.some(c=>c.id===want)?want:subs[0].id);
    });
    line.appendChild(btn);
   }
  }
  renderSubBar();
}
// 세부 범주 단추 (예: 시장 지표 → 지수·원자재·농산물·금리…). 세부 범주가 하나뿐인 묶음은 숨긴다.
function renderSubBar(){
  const bar=id('sub-bar');
  const subs=subsOf(groupOf(state.cat));
  bar.hidden=subs.length<2;
  bar.replaceChildren();
  if(bar.hidden)return;
  for(const c of subs){
    const b=document.createElement('button');b.type='button';b.textContent=c.label;
    const on=c.id===state.cat||(c.id==='realty:apt'&&isRealtyCat(state.cat));
    b.className=on?'active':'';
    b.setAttribute('aria-pressed',on?'true':'false');
    b.addEventListener('click',()=>selectCategory(c.id));
    bar.appendChild(b);
  }
}

// 그래프 제목 자리의 선택 상자: 지금 고른 묶음(예: 시장 지표)의 항목만 세부 범주별로 보여 준다.
// ETF 는 관심 ETF 와 지금 펼친 분류의 상품을 보여 준다.
// 선택 상자에는 지금 고른 중분류(예: 한국 경제 → 금리)의 소분류 항목(기준금리, CD …)만 보인다.
// ETF 는 관심 ETF 와 지금 펼친 분류의 상품.
function pickerGroups(){
  const label=categories().find(c=>c.id===state.cat)?.label||'';
  if(state.cat!==ETF_CAT)return [{label,items:itemsOf(state.cat)}];
  const out=[{label:'관심 ETF',items:etfShown().map(etfItem)}];
  if(state.etfTab&&state.etfTab!=='fav')out.push({label:etfCatLabel(state.etfTab),items:etfRows().map(([c])=>etfItem(c))});
  return out;
}
function renderPicker(){
  const sel=id('item-select');
  const want=`${state.sel.kind}:${state.sel.id}`;
  const groups=pickerGroups();
  const key=groups.map(x=>x.label+':'+x.items.map(i=>i.id).join(',')).join('|');
  if(sel.dataset.key!==key){
    sel.replaceChildren();
    for(const c of groups){
      const g=document.createElement('optgroup');g.label=c.label;
      for(const it of c.items){
        const o=document.createElement('option');o.value=`${it.kind}:${it.id}`;
        o.textContent=it.kind==='fx'?it.name:it.name;
        g.appendChild(o);
      }
      sel.appendChild(g);
    }
    sel.dataset.key=key;
  }
  sel.value=want;
}
// 그래프 제목과 범례·통계 이름: 고른 항목에 맞춘다.
function renderSelected(){
  const item=currentItem();
  const fx=item.kind==='fx';
  id('selected-name').textContent=fx?`단위: ${item.unit}`:`단위: ${item.unit}`;
  renderPicker();
  const freq={D:'일별',W:'주별',M:'월별',Q:'분기별',A:'연간'}[item.freq||'D'];
  const fxH=fx&&Array.isArray(state.data?.hourly)&&state.data.hourly.length>0;   // 시간별 시세는 게시하지 않음 (2026-11-27)
  id('legend-short').textContent=fxH?'단기 · 시간별 1년':`단기 · ${freq} 최근 구간`;
  id('legend-long').textContent=fx||item.kind==='market'||item.kind==='etf'?'장기 · 일별':`장기 · ${freq}`;
  id('stats-short-label').textContent=fxH?'단기 · 시간별 (전일까지)':`단기 · ${freq}`;
  id('stats-long-label').textContent=fx?'장기 · 일별 (전일까지)':`장기 · ${freq}`;
}

// 현황 목록: 항목별 현재 값. 값 옆에 전일 대비, 아래에 주·월·년 변동.
// 누르면 그래프가 그 항목으로 바뀐다. 오르면 빨강, 내리면 파랑.
function renderTiles(){
  const tm=state.cat===TMAP_CAT;id('tmap-section').hidden=!tm;
  if(tm){
    for(const k of ['rmap-section','pmap-section','combo-section','hub-section','smap-section','inc-section','rate-section'])id(k).hidden=true;
    document.querySelector('.target-panel').hidden=true;id('currency-grid').hidden=true;
    renderMetricBar();id('list-more').hidden=true;id('list-unit').hidden=true;
    id('list-title').textContent='무역·투자 · 수출입 지도';
    id('list-desc').textContent='대륙 → 나라 → 품목(HS 2단위)으로 내려갑니다. 수출·수입·무역수지 단추로 칸 크기와 색이 바뀌고, 해 단추로 기간을 고릅니다(올해는 누계, 맨 앞은 최근 달).';
    renderTmap();return;
  }
  if(state.cat===WTO_CAT){
    for(const k of ['rmap-section','pmap-section','combo-section','hub-section','smap-section','tmap-section','rate-section'])id(k).hidden=true;
    document.querySelector('.target-panel').hidden=true;id('currency-grid').hidden=true;id('inc-section').hidden=false;
    renderMetricBar();id('list-more').hidden=true;id('list-unit').hidden=true;
    id('list-title').textContent='국제 경제 · 무역';
    id('list-desc').textContent='WTO 통계로 주요 20개 경제의 평균 관세율과 서비스 수출입을 봅니다. 막대를 누르면 아래 추이 그래프에 넣거나 뺍니다.';
    renderWto();return;
  }
  const ic=isInc(state.cat);id('inc-section').hidden=!ic;
  if(ic){
    for(const k of ['rmap-section','pmap-section','combo-section','hub-section','smap-section'])id(k).hidden=true;
    document.querySelector('.target-panel').hidden=true;id('currency-grid').hidden=true;id('rate-section').hidden=true;
    renderMetricBar();id('list-more').hidden=true;id('list-unit').hidden=true;
    const c=INC_CATS.find(x=>x[0]===state.cat);
    id('list-title').textContent=`소득·자산 · ${c?c[1]:''}`;
    id('list-desc').textContent=state.cat==='inc:region'?'시도별 지역내총생산(GRDP)입니다. 칸 크기는 명목 GRDP, 색은 실질 성장률입니다. 1인당 개인소득 단추를 누르면 색이 전국 평균과의 차이로 바뀝니다. 칸을 누르면 그 지역의 GRDP·인구·집값 변동이 아래에 나옵니다.':'소득 5분위별로 나눠 봅니다. 위 칸은 최신값, 아래 그래프는 분위별 추이입니다.';
    incLoad().then(renderInc);return;
  }
  id('rate-section').hidden=state.cat!==RATE_CAT;
  if(state.cat===RATE_CAT)renderRates();
  const hb=String(state.cat).startsWith('hub:');
  id('hub-section').hidden=!hb;
  if(hb){
    id('rmap-section').hidden=true;id('pmap-section').hidden=true;id('combo-section').hidden=true;
    document.querySelector('.target-panel').hidden=true;id('currency-grid').hidden=true;
    renderMetricBar();id('list-more').hidden=true;id('list-unit').hidden=true;
    const sup=state.cat==='hub:supply';
    id('list-title').textContent=`부동산 · ${sup?'공급':'재고'}`;
    id('list-desc').textContent=sup?'건축HUB 주택인허가·건축인허가로 인허가 → 착공 → 준공 세대수, 철거·멸실, 순공급(준공 − 멸실)을 지역별로 봅니다. 네모 칸 크기는 인허가 세대수, 색은 전년 대비 증감입니다.'
      :'건축HUB 건축물대장으로 지역별 주택 수, 연식 분포, 30년 이상 노후 비율을 봅니다. 네모 칸 크기는 주택 수, 색은 노후 비율입니다. 단지를 고르면 전기·가스 사용량이 함께 나옵니다.';
    renderHub();return;
  }
  const sm=state.cat===SMAP_CAT;
  id('smap-section').hidden=!sm;
  if(sm){
    id('rmap-section').hidden=true;id('pmap-section').hidden=true;id('currency-grid').hidden=true;id('combo-section').hidden=false;
    document.querySelector('.target-panel').hidden=false;
    renderMetricBar();id('list-more').hidden=true;id('list-unit').hidden=true;
    id('list-title').textContent='금융 시장 · 주식';
    id('list-desc').textContent='네모 칸 크기는 시가총액, 색은 전 거래일 대비 등락률입니다. 종목 칸을 누르면 아래에 그 종목의 일별 종가 그래프가 나옵니다(시가총액 상위 500개와 관심 종목). 자료: 금융위원회 주식시세(공공데이터포털, 전 거래일 장 마감 기준).';
    renderSmap();return;
  }
  const rm=isRmap(state.cat),pm=isPmap(state.cat);    // 부동산 가격 분포·인구 지도(네모 지도)는 아래 그래프·관심 가격 칸 대신 따로 그린다
  id('rmap-section').hidden=!rm;id('pmap-section').hidden=!pm;
  id('combo-section').hidden=rm||pm;
  document.querySelector('.target-panel').hidden=rm||pm;
  id('currency-grid').hidden=rm||pm;
  if(pm){
    renderMetricBar();id('list-more').hidden=true;id('list-unit').hidden=true;
    id('list-title').textContent='인구 동향 · 인구 지도';
    id('list-desc').textContent='네모 칸 크기는 인구수, 색은 1년 전 같은 달보다 인구가 늘었는지 줄었는지입니다. 칸을 누르면 시도 → 시군구 → 읍면동으로 내려가고, 위쪽 경로를 누르면 올라갑니다. 자료: 행정안전부 주민등록 인구 및 세대현황.';
    renderPmap();return;
  }
  if(rm){
    renderMetricBar();id('list-more').hidden=true;
    const kind=state.rmap.kind;
    id('list-title').textContent=`부동산 · 가격 · ${rmapKindLabel()}`;id('list-unit').hidden=true;
    rmapKindTabs();
    id('list-desc').textContent='왼쪽 네모 칸(크기 = 고른 연도의 거래 건수)을 누르면 시도 → 시군구 → 법정동 → 단지(연립·다세대는 건물, 토지는 지목)로 내려갑니다. 위쪽 경로를 누르면 올라갑니다. 오른쪽 곡선은 ㎡당 가격별 거래 비중이고, 곡선 아래 점 하나가 거래 하나입니다(연도마다 색·모양이 다름, 시도·전국은 표본). 점을 누르면 아래에 그 단지의 장기 추이가 나옵니다: 아래 날짜는 전체 기간(선), 위 날짜는 최근 구간(점), 회색 띠는 최근 구간의 위치. 해제된 거래와 토지 지분 거래는 뺐습니다. 자료: 국토교통부 실거래가.';
    renderRmap();return;
  }
  renderMetricBar();                                  // 부동산 지표 단추는 부동산에서만 보인다
  if(state.cat===ETF_CAT){renderEtfCats();return}
  id('currency-grid').classList.remove('etf-cats');
  id('currency-grid').classList.toggle('home-grid',state.cat===HOME_CAT);   // 주요 지표: 넓은 화면은 3칸 × 2줄
  const fx=state.cat===FX_CAT;
  const label=categories().find(c=>c.id===state.cat)?.label||'';
  const grp=groupOf(state.cat);
  const glabel=GROUPS.find(g=>g[0]===grp)?.[1]||'';
  id('list-title').textContent=state.cat===HOME_CAT?'주요 지표':grp==='kr'||grp==='us'||grp==='cn'?`${glabel} · ${label} 현황`:`${label} 현황`;
  id('list-desc').textContent=state.cat===HOME_CAT
    ?'분야별 대표 지표를 모았습니다. 칸을 누르면 그 분야 화면으로 옮겨 갑니다. 비교 기준은 지표마다 다릅니다(시장 지표는 전일, 경제 지표는 직전 발표, 부동산은 1년 전 같은 달).'
    :state.cat===ETF_CAT
    ?'☆를 눌러 관심 ETF를 고릅니다(이 브라우저에만 저장). 고르기 전에는 시가총액 상위 4개를 보입니다. 값은 일별 종가입니다.'
    :isRealtyCat(state.cat)
    ?`국토교통부 실거래가의 월별 요약입니다. 계약 뒤 30일 안에 신고하므로 최근 두 달은 건수가 덜 찼습니다. 그래서 칸의 값은 ${state.realty?.settled_month||'두 달 전'} 기준입니다. ㎡당 값은 거래별 (가격 ÷ 면적)의 중앙값이고, 해제된 거래(토지는 지분 거래도)는 뺍니다. 시도 칸을 누르면 그 안의 시군구가 나옵니다. 가격 범위는 거래의 가운데 절반(하위 25%~상위 25%), 전국 대비는 전국 ㎡당 중위값을 100으로 본 값, 10년 중 위치는 그 전국 대비 값이 최근 10년 중 어디쯤인지, 전세가율은 ㎡당 전세 ÷ ㎡당 매매, 거래량 수준은 최근 12개월 거래가 그 전 5년 평균의 몇 배(평균=100)인지입니다. 표본이 적으면 비워 둡니다.`
    :state.cat==='macro:한국 무역'
    ?MACRO_DESC+` 한국은행 지표(수출입·경상수지 등) 뒤에 관세청 첨단산업 수출입이 이어집니다. 첨단산업 칸은 관세청 품목별·국가별 수출입실적(모든 나라·모든 품목)을 HS 품목번호로 묶어 더한 월간 값입니다(단위 억 달러). 반도체는 HS 8541·8542(태양전지 제외), 반도체 제조장비 8486, 디스플레이 8524·9013.80·9013.90, 이차전지 8507.60, 전기차 8703.80, 의약품·바이오 3002·3004, 컴퓨터 8471, 통신기기 8517, 산업용 로봇 8479.50, 항공기·드론·부품 8802·8803·8806·8807, 의료기기 9018·9019·9021·9022입니다. HS 개정(2007·2012·2017·2022)으로 번호가 바뀐 품목은 오래된 구간이 작게 잡힐 수 있습니다(디스플레이·전기차 등). 수출·수입 합계는 모든 나라를 다 받은 해만 보입니다${state.customs?.complete_years?.length?` (현재 ${state.customs.complete_years[0]}~${state.customs.complete_years.at(-1)}년)`:''}.`
    :state.cat.startsWith('macro:생활 물가 ')
    ?'KAMIS가 매일 조사하는 전국 평균 소매가격(상품 등급)입니다. 품목은 통계청 소비자물가지수의 농축수산물 대표품목과 맞춘 30개입니다. 개수로 파는 품목은 공시 단위(1포기·10개 등) 그대로이고 kg으로 바꾸지 않았습니다. 변동은 그날 값과 KAMIS가 함께 주는 1년 전 값 등을 비교합니다. 도매가격과 경매가(가격 사다리)는 다음 단계에서 붙입니다.'
    :state.cat===RATE_CAT
    ?`위쪽 표는 은행·저축은행(금융감독원 비교공시, 하루 한 번)과 신협·새마을금고(하루 한 번)의 같은 기간 금리를 나란히 놓습니다. 그래프는 한국은행 예금은행 가중평균금리(월별) 위에 은행별 공시 금리를 점으로 겹칩니다. 아래 칸은 대표 통계입니다. 칸을 누르면 맨 아래 그래프가 그 항목으로 바뀝니다.`
    :state.cat.startsWith('macro:')
    ?MACRO_DESC
    :fx
    ?'통화를 누르면 아래 그래프가 바뀝니다. Source: ECB statistics (유로/원 외는 ECB 기준 환율로 계산). 전일 대비와 1주·1달·1년 평균 대비는 최근 일별 기준환율을 직전 7일·30일·365일 평균과, 10년 최저는 최근 10년 중 가장 낮았던 값이고 괄호 안은 지금 값과의 차이입니다.'
    :`항목을 누르면 아래 그래프가 바뀝니다. 값은 일별 종가입니다. 전일 대비는 전 거래일과, 1주·1달·1년 평균 대비는 직전 7일·30일·365일 종가 평균과, 10년 최저는 최근 10년 최저 종가이고 괄호 안은 지금 값과의 차이입니다.${state.cat==='금리'?' 금리의 변동은 %p(두 금리의 차이)입니다.':''}`;
  id('list-unit').hidden=!fx;
  const grid=id('currency-grid');grid.replaceChildren();
  const all=itemsOf(state.cat);
  // 접었을 때 보이는 칸 수: 한 줄 칸 수의 두 줄 (넓은 화면 3칸 × 2 = 6, 휴대폰 1칸이면 4)
  const cols=(getComputedStyle(grid).gridTemplateColumns||'').split(' ').filter(Boolean).length||1;
  const LIMIT=cols<=1?4:cols*2;
  // 접힌 상태에서는 늘 앞의 칸만 보인다 (고른 항목이 뒤쪽이어도 순서를 바꾸지 않는다).
  const home=state.cat===HOME_CAT;
  const lim=home?6:LIMIT;                             // 주요 지표는 6칸만 보이고 나머지는 '전체 보기'
  const shown=!state.expanded&&all.length>lim?all.slice(0,lim):all;
  const more=id('list-more');
  more.hidden=all.length<=lim;
  more.textContent=state.expanded?'접기 ▲':`전체 보기 (${all.length}개) ▼`;
  more.setAttribute('aria-expanded',state.expanded?'true':'false');
  for(const item of shown){
    const q=quoteOf(item);
    const on=item.kind===state.sel.kind&&item.id===state.sel.id;
    const btn=document.createElement('button');btn.type='button';
    btn.className='currency-tile'+(on?' selected':'');
    btn.setAttribute('aria-pressed',on?'true':'false');
    const title=document.createElement('span');title.className='tile-name';title.textContent=item.title;
    const top=document.createElement('span');top.className='tile-rate-row tile-head';
    const rate=document.createElement('strong');rate.className='tile-amount';rate.textContent=(q.valueFormat||prettyRate)(q.value);
    const fmt=q.format||pct;
    const day=document.createElement('span');day.className='tile-day';
    const [dl,ds]=q.dayLabel||['전일 대비','전일'];
    const dayLabel=document.createElement('small');dayLabel.innerHTML=`<span class="lbl-long">${dl}</span><span class="lbl-short">${ds}</span>`;
    const dayValue=document.createElement('b');dayValue.className=signClass(q.d1);dayValue.textContent=fmt(q.d1);
    day.append(dayLabel,dayValue);
    top.prepend(title);top.append(rate,day);
    const row=document.createElement('span');row.className='tile-changes'+(q.cells?' cells-'+q.cells.length:'');
    // 경제 지표·부동산: 칸마다 [이름, 값, 적는 방법, (10년 최저 값)]
    for(const [name,v,f,low] of (q.cells||[])){
      const cell=document.createElement('span');cell.className='tile-change';
      const small=document.createElement('small');small.innerHTML=`<span class="lbl-long">${name}</span><span class="lbl-short">${name.replace(' 대비','')}</span>`;
      const value=document.createElement('b');
      value.textContent=f?f(v):String(v??'—');value.className=f&&(f===pct||f===pointText)?signClass(v):'';
      if(typeof low==='number'){
        cell.classList.add('tile-low');
        const amount=document.createElement('b');amount.className='low-amount';amount.textContent=prettyValue(low);
        value.textContent=`(${f(v)})`;cell.append(small,amount,value);
      }else cell.append(small,value);
      row.appendChild(cell);
    }
    for(const [name,key] of (q.cells?[]: [['1주 평균 대비','w'],['1달 평균 대비','m'],['1년 평균 대비','y'],['10년 최저','lo10']])){
      const cell=document.createElement('span');cell.className='tile-change';
      const small=document.createElement('small');small.innerHTML=`<span class="lbl-long">${name}</span><span class="lbl-short">${name.replace(' 대비','')}</span>`;
      const value=document.createElement('b');value.textContent=fmt(q.avg?.[key]);value.className=signClass(q.avg?.[key]);
      // 10년 최저는 최저 금액을 적고 괄호 안에 지금 값과의 차이를 적는다. 예: 1,056.86 (+27.10%)
      const low=q.avg?.lo10_value;
      if(key==='lo10'&&validNumber(low)){
        cell.classList.add('tile-low');
        const amount=document.createElement('b');amount.className='low-amount';amount.textContent=prettyRate(low*item.mult);
        value.textContent=`(${fmt(q.avg?.[key])})`;
        cell.append(small,amount,value);row.appendChild(cell);continue;
      }
      cell.append(small,value);row.appendChild(cell);
    }
    btn.append(top,row);
    const drill=item.kind==='realty'&&item.region.length===2&&!state.realtySido;
    if(drill){btn.classList.add('drill');row.insertAdjacentHTML('beforeend','<span class="drill-hint">시군구 보기 ›</span>')}
    btn.addEventListener('click',()=>{
      if(drill){state.realtySido=item.region;state.expanded=false;selectItem(item);return}   // 시도 → 그 안의 시군구 칸
      if(home){                                       // 주요 지표 칸: 그 항목의 분류로 옮겨 가서 고른다
        state.sel={kind:item.kind,id:item.id};
        selectCategory(catOfSel(item.kind,item.id));
        selectItem(item);
        window.scrollTo({top:0,behavior:'smooth'});
        return;
      }
      selectItem(item);
      id('combo-section').scrollIntoView({behavior:'smooth',block:'start'});
    });
    grid.appendChild(btn);
  }
}

// 서울 아파트: 칸의 대표 값과 그래프에 쓸 지표를 고르는 단추
function renderMetricBar(){
  const bar=id('metric-bar');
  bar.hidden=!isRealtyCat(state.cat);
  if(bar.hidden)return;
  bar.replaceChildren();
  const type=state.cat.slice(7);
  for(const [t,label] of Object.entries(state.realty?.types||{})){       // 종류 고르기 (지역 통계 안에서)
    const b=document.createElement('button');b.type='button';b.textContent=label;b.className='kind'+(t===type?' active':'');
    b.addEventListener('click',()=>{if(t!==type)selectCategory('realty:'+t)});
    bar.appendChild(b);
  }
  if(state.realtySido){
    const back=document.createElement('button');back.type='button';back.className='back';back.textContent='← 전국·시도';
    back.addEventListener('click',()=>{state.realtySido=null;state.expanded=false;renderTiles();renderPicker()});
    bar.appendChild(back);
  }
  for(const [k,label] of realtyMetrics(type)){
    const b=document.createElement('button');b.type='button';b.textContent=label;
    b.className=state.realtyMetric===k?'active':'';
    b.addEventListener('click',()=>{
      state.realtyMetric=k;
      renderTiles();renderSelected();
      if(state.sel.kind==='realty')loadItem(currentItem());
    });
    bar.appendChild(b);
  }
}
function showNotice(text){
  const box=id('notice');
  box.textContent=text||'';
  box.hidden=!text;
}
// 위쪽 상태 표시는 짧게 수집 시각만 적는다 (오늘이면 '16:41 수집'). 자세한 내용은 손가락을 올리면(title) 보인다.
function shortStamp(iso){
  if(!iso||!Number.isFinite(Date.parse(iso)))return '—';
  const p=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date(iso));
  const g=k=>p.find(x=>x.type===k)?.value||'';
  const today=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const same=today.find(x=>x.type==='month')?.value===g('month')&&today.find(x=>x.type==='day')?.value===g('day');
  return same?`${g('hour')}:${g('minute')}`:`${g('month')}.${g('day')} ${g('hour')}:${g('minute')}`;
}
// 위쪽 상태 표시용: 오늘이어도 날짜를 함께 적는다 (예: 11.26 15:02)
function fullStamp(iso){
  if(!iso||!Number.isFinite(Date.parse(iso)))return '—';
  const p=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date(iso));
  const g=k=>p.find(x=>x.type===k)?.value||'';
  return `${g('month')}.${g('day')} ${g('hour')}:${g('minute')}`;
}
// 이름 아래: 모아 둔 자료의 가짓수 (소분류 = 그래프로 볼 수 있는 항목 하나)
function renderDataCount(){
  const el=id('data-count');if(!el)return;
  const macro=MACRO.reduce((a,k)=>a+Object.values(state[k]?.items||{}).filter(m=>m.count).length,0);
  const market=Object.values(state.market?.items||{}).filter(m=>m.last).length;
  const fx=Object.keys(state.fx?.currencies||{}).length;
  const etf=Object.keys(state.etf?.items||{}).length;
  const regions=new Set(Object.values(state.realty?.items||{}).flatMap(t=>Object.keys(t))).size;
  const n=x=>x.toLocaleString('ko-KR');
  el.textContent=`지표 ${n(fx+market+macro)}개`;          // 지표 개수만 (ETF·부동산 지역 수는 풀이에만, 2026-11-26)
  el.title=`소분류 기준: 환율 ${fx}, 시장 지표 ${market}, 경제 지표 ${macro}, ETF ${etf}, 부동산 지역 ${regions}`;
}
function setTop(iso,detail,ok){
  const top=id('top-status');
  top.textContent=`${fullStamp(iso)} 수집`;top.title=detail;top.className=ok?'top-status ok':'top-status warn';
}
// 위쪽 상태 표시: 고른 범주의 수집 상태. 안내 상자는 문제가 있을 때만 보인다.
function renderStatus(){
  const top=id('top-status');
  const fx=state.cat===FX_CAT;
  if(state.cat===ETF_CAT){renderEtfStatus();return}
  if(state.cat===SMAP_CAT&&state.fsc?.generated_at){const t=inKorea(state.fsc.generated_at,true);setTop(state.fsc.generated_at,`${t} 수집`,true);showNotice('');return}
  if(state.cat===HOME_CAT){                          // 주요 지표: 가장 최근 수집 시각만 적는다
    const last=['fx','market','ecos','fsc','fred','realty'].map(k=>state[k]?.generated_at).filter(Boolean).sort().pop();
    const t=last?inKorea(last,true):'—';
    setTop(last,`${t} 수집`,true);
    id('footer-updated').textContent=`마지막 수집 실행 ${t}`;showNotice('');return;
  }
  if(isRealtyCat(state.cat)||isRmap(state.cat)||isPmap(state.cat)||state.cat.startsWith('macro:')||state.cat.startsWith('hub:')){renderOtherStatus();return}
  const summary=fx?state.fx:state.market;
  if(!summary?.generated_at){
    top.textContent='최초 수집 필요';top.className='top-status warn';
    showNotice('아직 수집된 자료가 없습니다. Market_Runner의 첫 수집과 게시를 기다려 주세요.');
    return;
  }
  const t=inKorea(summary.generated_at,true);
  const total=fx?FX.length:Object.keys(summary.items||{}).length;
  const ok=fx?FX.filter(c=>summary.currencies?.[c.code]?.latest?.rate>0||summary.currencies?.[c.code]?.daily_last?.[1]>0).length
             :Object.values(summary.items||{}).filter(m=>m.last).length;
  const errorCount=summary.errors?.length||0;
  setTop(summary.generated_at,`${ok}/${total} ${fx?'시세':'항목'} · ${t} 수집`,ok===total&&!errorCount);
  id('footer-updated').textContent=`마지막 수집 실행 ${t}`;
  showNotice(ok===total&&!errorCount?'':`${fx?'시세':'시장 지표'} 수집 ${ok}/${total}종 성공${errorCount?` · 부분 수집 오류 ${errorCount}건`:''}`);
}

// 고른 항목이 아직 게시돼 있는지. 없으면 주요 지표의 첫 항목으로 (재배포 원칙으로 빠진 자료 대비, 2026-11-27)
function selExists(sel){
  if(!sel)return false;
  if(sel.kind==='fx')return !!state.fx?.currencies?.[sel.id];
  if(sel.kind==='market')return !!state.market?.items?.[sel.id];
  if(sel.kind==='etf')return !!state.etf?.items?.[sel.id];
  if(sel.kind==='stock')return (state.fsc?.stock_detail||[]).includes(sel.id);
  if(sel.kind==='realty'){const it=realtyFromId(sel.id);return !!state.realty?.items?.[it.type]?.[it.region]}
  if(MACRO.includes(sel.kind))return !!state[sel.kind]?.items?.[sel.id];
  return false;
}
function fallbackSel(){
  for(const [k,key] of HOME_ITEMS){const it=homeItem(k,key);if(it)return {kind:it.kind,id:it.id}}
  for(const kind of MACRO){const k=Object.keys(state[kind]?.items||{})[0];if(k)return {kind,id:k}}
  return {kind:'ecos',id:'base_rate'};
}
// ---------------- 주식 (금융위원회 주식시세, 2026-11-27) ----------------
// 네모 칸: 시장(코스피·코스닥·코넥스) → 종목. 크기 = 시가총액, 색 = 전 거래일 대비 등락률. 종목을 누르면 아래 그래프.
const SMAP_CAT='smap:stock';
state.smap={path:[],latest:null};
function stockItem(code){
  const r=state.smap.latest?.rows?.find(x=>x[0]===code);
  const nm=r?.[1]||code;
  return {kind:'stock',id:code,cat:SMAP_CAT,name:`${nm} ${code}`,title:`${nm} · ${code}`,mult:1,unit:'원',suffix:'원',file:`./data/fsc/stock/${code}.json`};
}
function stockFavs(){try{const v=JSON.parse(safeGet('stockFav')||'null');if(Array.isArray(v))return v}catch(_){}return null}
function capText(won){if(won==null)return '—';const e=won/1e8;return e>=10000?`${(e/10000).toFixed(e>=100000?0:1)}조`:`${Math.round(e).toLocaleString('ko-KR')}억`}
// v2 (2026-11-27 계획 1단계): 시장 → 업종 → 종목. 업종은 DART 업종코드를 13개 묶음으로 (data/dart/sectors.json).
// 칸 크기 = 시가총액(합), 색 = 고른 기간의 등락률(업종·시장은 시가총액 가중). 기간 단추 1일·1주·1달·1년.
const SMAP_PERIODS=[['1d','1일',1],['1w','1주',2],['1m','1달',4],['1y','1년',10]];   // 셋째 값: 색 경계 배율 (1일 ±1·±3% → 1년 ±10·±30%)
async function renderSmap(){
  const S=state.smap,tree=id('smap-tree');
  if(!S.latest){tree.textContent='자료를 불러오는 중…';S.latest=await requestJSON('./data/fsc/stock_latest.json').catch(()=>null)}
  if(S.sec===undefined)S.sec=await requestJSON('./data/dart/sectors.json').catch(()=>null);
  S.per=S.per||'1d';
  const L=S.latest;
  if(!L?.rows){tree.textContent='주식 자료를 불러오지 못했습니다.';return}
  const c=L.cols,iC=c.indexOf('srtnCd'),iN=c.indexOf('itmsNm'),iM=c.indexOf('mrktCtg'),iP=c.indexOf('clpr'),iF=c.indexOf('fltRt'),iA=c.indexOf('mrktTotAmt'),iT=c.indexOf('trPrc');
  const rows=L.rows.filter(r=>r[iA]>0);
  const byCode=new Map(rows.map(r=>[r[iC],r]));
  const day=String(L.day||'');const dtxt=day.length===8?`${day.slice(0,4)}.${day.slice(4,6)}.${day.slice(6)}`:day;
  const detail=new Set(state.fsc?.stock_detail||[]);
  const SEC=S.sec?.markets?S.sec:null;
  const [mk,sg]=S.path;
  const per=SEC?S.per:'1d',pi=SMAP_PERIODS.findIndex(x=>x[0]===per),scale=SMAP_PERIODS[pi][2],plab=SMAP_PERIODS[pi][1];
  // 기간 단추 (업종 자료가 있을 때만)
  let pb=id('smap-period');
  if(!pb){pb=document.createElement('div');pb.id='smap-period';pb.className='rate-btns';tree.parentNode.insertBefore(pb,tree)}
  pb.replaceChildren();pb.hidden=!SEC;
  if(SEC)for(const [k,lab] of SMAP_PERIODS){const b=document.createElement('button');b.type='button';b.className='rate-btn'+(k===per?' on':'');b.textContent=lab;b.addEventListener('click',()=>{S.per=k;renderSmap()});pb.appendChild(b)}
  let items,lvl;
  if(SEC&&!mk){
    lvl=0;items=Object.entries(SEC.markets).map(([m,v])=>({key:m,label:m,n:v.cap,v:v.cap,st:{p:v.r?.[per],cap:v.cap,cnt:v.n}}));
  }else if(SEC&&mk&&!sg&&SEC.markets[mk]){
    lvl=1;const M=SEC.markets[mk];
    items=Object.entries(M.sectors).map(([g,v])=>({key:g,label:g,n:v.cap,v:v.cap,st:{p:v.r?.[per],cap:v.cap,cnt:v.n}}));
    if(M.rest?.n)items.push({key:'_rest',label:`나머지 ${M.rest.n.toLocaleString('ko-KR')}종목`,n:M.rest.cap,v:M.rest.cap,st:{p:per==='1d'?M.rest.r?.['1d']:null,cap:M.rest.cap,cnt:M.rest.n,rest:true}});
  }else if(SEC&&mk&&sg&&SEC.markets[mk]?.sectors?.[sg]){
    lvl=2;const k=SEC.periods.indexOf(per);
    items=SEC.markets[mk].sectors[sg].stocks.map(x=>{const r=byCode.get(x[0]);return {key:x[0],label:x[1],n:x[2],v:x[2],st:{p:x[3+k],cap:x[2],price:r?.[iP],tr:r?.[iT],mkt:mk,induty:x[7]}}});
  }else{
    lvl=2;items=rows.filter(r=>!mk||(r[iM]||'기타')===mk).map(r=>({key:r[iC],label:r[iN],n:r[iA],v:r[iA],st:{p:r[iF],cap:r[iA],price:r[iP],tr:r[iT],mkt:r[iM]}}));
  }
  items.sort((a,b)=>b.v-a.v);
  const mkOpts=async()=>(SEC?Object.keys(SEC.markets):[...new Set(rows.map(r=>r[iM]||'기타'))]).map(k=>[k,k]);
  const lv=[{name:'전체'},{name:'시장',label:mk,options:mkOpts}];
  if(SEC)lv.push({name:'업종',label:sg,options:async()=>Object.keys(SEC.markets[mk]?.sectors||{}).map(k=>[k,k])});
  tmCrumbs(id('smap-crumbs'),lv,S.path,np=>{S.path=np;renderSmap()});
  id('smap-note').textContent=`${dtxt} 장 마감 기준 · ${lvl===0?'시장':lvl===1?`${mk} 업종 ${items.length}칸`:`${items.length.toLocaleString('ko-KR')}종목`}`;
  tree.replaceChildren();
  const pc=v=>v==null?'—':`${v>0?'+':''}${Number(v).toFixed(2)}%`;
  const narrow=window.matchMedia('(max-width:540px)').matches;
  tmCells(tree,tmLimit(items,narrow?80:lvl===2?200:150),{
    etcText:t=>`시총 ${capText(t.n)}`,
    stOf:t=>t.st,tone:st=>rmapTone(st?.p==null?null:st.p/scale),isOn:t=>lvl===2&&state.sel.kind==='stock'&&t.key===state.sel.id,unit:'',
    layouts:(t,st)=>{
      const nm={cls:'nm',text:t.label},ch={cls:'big',text:pc(st?.p)},cap={cls:'sub',text:`시총 ${capText(st?.cap)}`};
      const pr={cls:'sub',text:st?.price!=null?`${Number(st.price).toLocaleString('ko-KR')}원`:`${(st?.cnt||0).toLocaleString('ko-KR')}종목`};
      return [[nm,ch,cap,pr],[nm,ch,cap],[nm,{cls:'mix',text:`${pc(st?.p)} · ${capText(st?.cap)}`}],[nm,ch],[{cls:'mix',text:`${tmShort(t.label)} ${pc(st?.p)}`}],[nm]];
    },
    tipLines:(t,st)=>lvl<2?[t.label,`${plab} 등락률 ${pc(st?.p)}${lvl<2&&!st?.rest?' (시가총액 가중)':''}`,`시가총액 ${capText(st?.cap)}`,`${(st?.cnt||0).toLocaleString('ko-KR')}종목`,
        ...(st?.rest?['시가총액 상위 500 밖 종목 (업종 나누지 않음, 1일 등락률만)']:[])]
      :[`${t.label} (${t.key}${st?.mkt?' · '+st.mkt:''})`,`${plab} 등락률 ${pc(st?.p)}`,`시가총액 ${capText(st?.cap)}`,
      `종가 ${st?.price!=null?Number(st.price).toLocaleString('ko-KR')+'원':'—'}`,`거래대금 ${capText(st?.tr)}`,...(st?.induty?[`업종코드 ${st.induty}`]:[]),
      ...(!detail.has(t.key)?['일별 그래프는 시가총액 상위 500개·관심 종목만']:[])],
    hint:lvl<2?'한 번 더 누르면 안으로 들어갑니다':'한 번 더 누르면 아래에 그래프가 나옵니다',
    go:t=>{
      if(lvl===0){S.path=[t.key];renderSmap();return}
      if(lvl===1){if(t.st?.rest){showNotice('나머지 종목은 업종을 나누지 않습니다. 시장 단계에서 종목 목록을 보려면 업종 자료가 없을 때의 화면을 쓰거나 아래 관심 종목을 이용하세요.');return}S.path=[mk,t.key];renderSmap();return}
      if(!detail.has(t.key)){showNotice(`${t.label}: 일별 그래프는 시가총액 상위 500개와 관심 종목만 만듭니다.`);return}
      selectItem(stockItem(t.key));id('combo-section').scrollIntoView({behavior:'smooth',block:'start'});
    }});
  const b1=scale,b3=scale*3;
  tmLegend(id('smap-legend'),[['rc-up2',`+${b3}% 이상`],['rc-up1',`+${b1}~${b3}%`],['rc-flat',`-${b1}~+${b1}%`],['rc-dn1',`-${b1}~-${b3}%`],['rc-dn2',`-${b3}% 이하`]],
    `칸 크기: 시가총액${lvl<2?' 합':''} · 색: ${plab} 등락률${lvl<2?'(시가총액 가중)':''}. 오르면 빨강, 내리면 파랑.`+(SEC?' 업종은 DART 기업개황 업종코드(한국표준산업분류)를 13개로 묶은 것이고, 시가총액 상위 500 종목만 나눕니다. 1주·1달·1년은 상위 500 종목의 종가로 계산합니다.':' 업종 자료(DART)를 받기 전이라 시장 → 종목으로 보입니다.'));
  id('smap-note2').textContent=tmTapNote();
  renderStockList(rows,iC,iN,iP,iF,iA,detail);
}
function renderStockList(rows,iC,iN,iP,iF,iA,detail){
  const box=id('smap-list');box.replaceChildren();
  const favs=stockFavs()||[];const codes=[...new Set([...favs,...(state.fsc?.watch||[])])];   // 고른 종목 먼저, 그다음 시가총액 상위 30
  const h=document.createElement('h3');h.className='smap-list-title';h.textContent='관심 종목 (★ 고른 종목 · 시가총액 상위 30)';box.appendChild(h);
  const by=new Map(rows.map(r=>[r[iC],r]));
  for(const code of codes){
    const r=by.get(code);if(!r)continue;
    const row=document.createElement('div');row.className='etf-row'+(state.sel.kind==='stock'&&state.sel.id===code?' selected':'');
    const main=document.createElement('button');main.type='button';main.className='etf-main';
    const rank=document.createElement('span');rank.className='etf-rank';rank.textContent=String(box.querySelectorAll('.etf-row').length+1);
    const name=document.createElement('span');name.className='etf-name';const b=document.createElement('b');b.textContent=r[iN];const sm=document.createElement('small');sm.textContent=`${code} · 시총 ${capText(r[iA])}`;name.append(b,sm);
    const price=document.createElement('span');price.className='etf-price';price.textContent=r[iP]!=null?Number(r[iP]).toLocaleString('ko-KR'):'—';
    const val=document.createElement('span');val.className='etf-val '+signClass(r[iF]);val.textContent=pct(r[iF]);
    main.append(rank,name,price,val);
    main.addEventListener('click',()=>{if(detail.has(code)){selectItem(stockItem(code));id('combo-section').scrollIntoView({behavior:'smooth',block:'start'})}else showNotice('이 종목은 일별 그래프를 아직 만들지 않았습니다.')});
    const fs=new Set(favs);const star=document.createElement('button');star.type='button';star.className='etf-star'+(fs.has(code)?' on':'');star.textContent=fs.has(code)?'★':'☆';
    star.addEventListener('click',()=>{const f=new Set(stockFavs()||[]);f.has(code)?f.delete(code):f.add(code);safeSet('stockFav',JSON.stringify([...f]));renderSmap()});
    row.append(main,star);box.appendChild(row);
  }
  const p=document.createElement('p');p.className='rmap-note';p.textContent='☆를 누르면 관심 종목이 되어 목록 맨 위에 옵니다(이 브라우저에만 저장). 일별 그래프는 시가총액 상위 500개와 기본 관심 종목에 있습니다.';box.appendChild(p);
}
// ---------------- 예금·대출 금리 (2026-11-27) ----------------
// 은행·저축은행(금감원 finlife) · 신협·새마을금고(deposit) · 한국은행 예금은행 가중평균금리(ECOS 월별)를 한 화면에서 비교한다.
// 비교 표: 같은 상품·기간 기준 / 그래프: ECOS 월별 선 위에 finlife 금융회사별 금리 분포 / 순위 / 가입 금액별 보기(정기예금)
const RATE_CAT='macro:예금·대출 금리';
const RATE_KINDS=[['dep','정기예금'],['sav','정기적금'],['mort','주택담보대출'],['rent','전세자금대출'],['credit','신용대출']];
const RATE_ECOS={dep:'bank_dep_time',sav:'bank_dep_installment',mort:'bank_loan_mort',rent:'bank_loan_rent',credit:'bank_loan_credit'};
const RATE_INST=[['bank','은행','finlife'],['sb','저축은행','finlife'],['cu','신협','deposit'],['kfcc','새마을금고','deposit']];
const RATE_AMTS=[[10000000,'1천만 원'],[50000000,'5천만 원'],[100000000,'1억 원']];
state.rates={kind:'dep',grp:'bank',term:12,sub:'F',amt:10000000,rank:null,amounts:null,loaded:false,series:{},set:'g'};   // set: g 일반 상품(누구나 가입·이벤트형 아님, 기본) / all 전체 (2026-11-28)
const rateLoan=k=>k==='mort'||k==='rent'||k==='credit';
const rateSubs=k=>k==='credit'?[['avg','평균']]:rateLoan(k)?[['F','고정'],['C','변동']]:[[6,'6개월'],[12,'12개월'],[24,'24개월']];
function rateVal(src,key){const m=state[src]?.items?.[key];return m&&m.last?m.last[1]:null}
// 일반 상품 값이 있으면 그 이름(bankg_·sbg_·cug_·kfccg_), 없으면(대출·아직 안 만든 날) 전체 값 이름
// 새마을금고는 '일반'일 때 지역 금고만(kfccr_, 직장 금고 뺌) 값을 쓴다 (2026-11-28 deposit v0.6)
function rateKey(src,g,rest){if(state.rates.set==='g'){if(g==='kfcc'){const r=`kfccr_${rest}`;if(state[src]?.items?.[r])return r}const k=`${g}g_${rest}`;if(state[src]?.items?.[k])return k}return `${g}_${rest}`}
function rateTop(src,key){const t=state[src]?.items?.[key]?.top;if(!t)return '';const lim=t.event?'이벤트형':(t.restricted&&t.restricted.length?'대상 제한: '+t.restricted.join('·'):'누구나 가입');return `${t.co} ${String(t.product||'').replace(/\s+/g,' ')} (${lim})`}
function rateN(src,key){return state[src]?.items?.[key]?.n??null}
const rateFmt=v=>v==null?'–':Number(v).toFixed(2);
function rateEl(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e}
function rateBtns(list,cur,on){
  const w=rateEl('div','rate-btns');
  for(const [v,label] of list){const b=rateEl('button','rate-btn'+(String(v)===String(cur)?' on':''),label);b.type='button';b.addEventListener('click',()=>on(v));w.appendChild(b)}
  return w;
}
async function rateLoad(){
  if(state.rates.loaded)return;
  state.rates.loaded=true;
  const [rk,am]=await Promise.allSettled([requestJSON('./data/finlife/rank.json'),requestJSON('./data/finlife/amounts.json')]);
  state.rates.rank=rk.status==='fulfilled'?rk.value:null;
  state.rates.amounts=am.status==='fulfilled'?am.value:null;
}
async function rateSeries(kind,key){
  const k=kind+'/'+key;
  if(!(k in state.rates.series)){
    try{state.rates.series[k]=(await requestJSON(`./data/${kind}/${key}.json`)).daily||[]}catch(_){state.rates.series[k]=[]}
  }
  return state.rates.series[k];
}
async function renderRates(){
  const box=id('rate-section');box.replaceChildren();
  await rateLoad();
  const R=state.rates,loan=rateLoan(R.kind);
  if(!loan&&!rateSubs(R.kind).some(([v])=>v===R.term))R.term=12;
  if(loan&&!rateSubs(R.kind).some(([v])=>v===R.sub))R.sub=rateSubs(R.kind)[0][0];
  box.appendChild(rateBtns(RATE_KINDS,R.kind,v=>{R.kind=v;renderRates()}));
  if(!loan)box.appendChild(rateBtns([['g','일반 상품'],['all','전체 상품']],R.set,v=>{R.set=v;renderRates()}));
  // 1. 비교 표
  state.rates._tops=[];
  const tbl=rateEl('table','rate-table');const head=rateEl('tr');head.appendChild(rateEl('th',null,''));
  const cols=rateSubs(R.kind);for(const [,l] of cols)head.appendChild(rateEl('th',null,l));tbl.appendChild(head);
  for(const [g,label,src] of RATE_INST){
    if(loan&&src==='deposit')continue;                      // 신협·새마을금고는 예·적금만
    const tr=rateEl('tr');tr.appendChild(rateEl('th',null,label));let any=false;
    const tops=[];
    for(const [sub] of cols){
      const base=rateKey(src,g,`${R.kind}${sub}_mean`).replace(/_mean$/,'');const td=rateEl('td');
      const mean=rateVal(src,base+'_mean');
      if(mean!=null)any=true;
      const med=rateVal(src,base+'_median');
      const medFirst=g==='kfcc'&&base.startsWith('kfccr_')&&med!=null;   // 새마을금고 지역 금고: 굵은 글씨는 중앙값
      td.appendChild(rateEl('b',null,rateFmt(medFirst?med:mean)));
      const parts=[];
      if(medFirst){if(mean!=null)parts.push('평균 '+rateFmt(mean))}else if(med!=null)parts.push('중앙 '+rateFmt(med));
      if(loan){const lo=rateVal(src,base+'_min'),hi=rateVal(src,base+'_max');if(lo!=null)parts.push(`${rateFmt(lo)}~${rateFmt(hi)}`)}
      else{const hi=rateVal(src,base+'_max');if(hi!=null)parts.push('최고 '+rateFmt(hi));const tp=rateTop(src,base+'_max');if(tp&&sub===12)tops.push(`${label} 12개월 최고 ${rateFmt(hi)}%: ${tp}`)}
      if(!loan&&g==='kfcc'&&sub===12)parts.push(base.startsWith('kfccr_')?'지역 금고 중앙값 · 우대금리 공시 없음':'우대금리 공시 없음');
      const n=rateN(src,base+'_mean');if(n)parts.push(n+'곳');
      if(parts.length)td.appendChild(rateEl('small',null,parts.join(' · ')));
      tr.appendChild(td);
    }
    if(any||src==='finlife')tbl.appendChild(tr);
    state.rates._tops=(state.rates._tops||[]).concat(tops);
  }
  const ek=RATE_ECOS[R.kind],em=state.ecos?.items?.[ek];
  box.appendChild(rateEl('h3','rate-h',loan?'금융회사별 전월 평균 대출금리 비교 (연 %)':'같은 기간 기본금리 비교 (연 %)'));
  box.appendChild(tbl);
  const note=rateEl('p','rmap-note');
  note.textContent=(loan?'금융회사마다 상품의 전월 취급 평균금리를 평균해 대표값으로 잡고, 그 평균(굵은 글씨)·중앙값·최저~최고를 냅니다. 주택담보대출은 아파트·분할상환만입니다. '
    :'금융회사(조합·금고)마다 같은 기간에서 가장 높은 기본금리를 대표값으로 잡고, 그 평균(굵은 글씨)·중앙값·최고값을 냅니다. 특판·이벤트 상품은 뺍니다. ')
    +(em?.last?`한국은행 예금은행 평균(신규취급액, ${String(em.last[0]).slice(0,7)}): ${rateFmt(em.last[1])}%.`:'');
  box.appendChild(note);
  if(!loan){
    const tn=rateEl('p','rmap-note');
    tn.textContent=(R.set==='g'?'일반 상품: 누구나 가입할 수 있고 이벤트형이 아닌 상품만 셉니다(나이·첫 거래·서민 전용 등 대상 제한 상품과 경기 성과·판매기간 한정 같은 이벤트형 상품 제외). 신협은 상품 이름으로만 가립니다. 새마을금고는 직장 금고(임직원만 이용)를 뺀 지역 금고만 세고, 굵은 글씨가 중앙값입니다. '
      :'전체 상품: 대상 제한·이벤트형 상품도 포함합니다. ')+(state.rates._tops.length?'최고값 상품 — '+state.rates._tops.join(' / '):'');
    box.appendChild(tn);
  }
  // 1-2. 출처마다 공시하는 항목 (2026-11-27 점검: 새마을금고 금리 화면은 기본이율만 공시). ○ 있음, △ 글에서 찾을 때만
  if(!loan){
    const F=[['기본금리','○','○','○','○'],['최고(우대)금리','○','○','○','공시 없음'],['최고한도','○','○','○','공시 없음'],['가입대상','○','○','○','공시 없음'],
      ['우대조건','○','○','○','공시 없음'],['단리·복리','○','○','△','공시 없음'],['만기 후 이자율','○','○','○','확인 중'],['최소 가입 금액','△','△','△','공시 없음']];
    const t2=rateEl('table','rate-table rate-avail');const h2=rateEl('tr');for(const c of ['항목','은행','저축은행','신협','새마을금고'])h2.appendChild(rateEl('th',null,c));t2.appendChild(h2);
    for(const r of F){const tr=rateEl('tr');tr.appendChild(rateEl('th',null,r[0]));for(const v of r.slice(1)){const td=rateEl('td',v==='공시 없음'?'na':v==='확인 중'?'tbd':'',v);tr.appendChild(td)}t2.appendChild(tr)}
    box.appendChild(rateEl('h3','rate-h','출처마다 공시하는 항목'));box.appendChild(t2);
    box.appendChild(rateEl('p','rmap-note','○ 공시 있음 · △ 기타 유의사항 글에 적힌 경우만 · 공시 없음: 그 기관 공시 화면에 항목이 없음. 신협 상세 항목은 주 1회(일요일) 저장합니다. 새마을금고 최고(우대)금리가 비는 것은 금고 금리 화면에 기본이율만 공시되기 때문입니다.'));
  }
  // 2. 그래프: ECOS 월별 선 + finlife 분포
  box.appendChild(rateEl('h3','rate-h','한국은행 월별 평균 위에 은행 상품 금리 분포'));
  const chart=rateEl('div','rate-chart');box.appendChild(chart);
  const sub=loan?R.sub:12;
  const fk=rateKey('finlife','bank',`${R.kind}${sub}_mean`).replace(/_mean$/,'');
  const [eco,fm,fhi,flo]=await Promise.all([rateSeries('ecos',ek),rateSeries('finlife',fk+'_mean'),rateSeries('finlife',fk+'_max'),rateSeries('finlife',fk+(loan?'_min':'_median'))]);
  const dots=(R.rank?.items?.[fk]||R.rank?.items?.[`bank_${R.kind}${sub}`]||[]).map(r=>r[1]).filter(v=>v!=null);
  chart.appendChild(rateSvg(eco,fm,fhi,flo,dots,R.rank?.day,loan,chart.clientWidth));
  box.appendChild(rateEl('p','rmap-note',`검은 선: 한국은행 예금은행 ${RATE_KINDS.find(k=>k[0]===R.kind)[1]} 가중평균금리(월별, 신규취급액). 파란 점선: 은행 공시 금리 평균(${loan?'전월 평균금리':'12개월 기본금리'}), 띠: ${loan?'최저~최고':'중앙값~최고'}. 오른쪽 끝 점: 최근 날짜의 은행별 금리(한 점이 한 은행). 한국은행 값은 실제 새로 맺은 계약의 평균이고, 공시 금리는 상품에 적힌 금리라 서로 다를 수 있습니다.`));
  // 3. 순위
  const ctl=rateEl('div','rate-ctl');
  ctl.appendChild(rateBtns([['bank','은행'],['sb','저축은행']],R.grp,v=>{R.grp=v;renderRates()}));
  ctl.appendChild(rateBtns(rateSubs(R.kind),loan?R.sub:R.term,v=>{loan?R.sub=v:R.term=Number(v);renderRates()}));
  box.appendChild(rateEl('h3','rate-h',`${R.grp==='bank'?'은행':'저축은행'}별 순위 (${loan?'낮은 순':'높은 순'})`));
  box.appendChild(ctl);
  const rkey=`${R.grp}${!loan&&R.set==='g'?'g':''}_${R.kind}${loan?R.sub:R.term}`;
  const rows=R.rank?.items?.[rkey]||R.rank?.items?.[`${R.grp}_${R.kind}${loan?R.sub:R.term}`]||[];
  const list=rateEl('div','rate-rank');
  if(!rows.length)list.appendChild(rateEl('p','rmap-note','아직 자료가 없습니다 (하루 한 번, 한국 시각 9시 이후에 받습니다).'));
  rows.slice(0,15).forEach((r,i)=>{
    const row=rateEl('div','rate-row');
    row.append(rateEl('span','etf-rank',String(i+1)));
    const nm=rateEl('span','rate-name');nm.append(rateEl('b',null,r[0]),rateEl('small',null,r[3]||''));row.append(nm);
    row.append(rateEl('span','rate-v',rateFmt(r[1])));
    row.append(rateEl('span','rate-v2',r[2]!=null?'최고 '+rateFmt(r[2]):''));
    list.appendChild(row);
  });
  box.appendChild(list);
  // 4. 가입 금액별 보기 (정기예금)
  if(R.kind==='dep'){
    box.appendChild(rateEl('h3','rate-h','가입 금액별 보기 (정기예금)'));
    box.appendChild(rateBtns(RATE_AMTS,R.amt,v=>{R.amt=Number(v);renderRates()}));
    const a=R.amounts?.items?.[R.grp]?.[String(R.term)]?.[String(R.amt)];
    if(!a){box.appendChild(rateEl('p','rmap-note','아직 자료가 없습니다.'))}
    else{
      box.appendChild(rateEl('p','rate-amt-sum',`${RATE_AMTS.find(x=>x[0]===R.amt)[1]}을 ${R.term}개월 넣을 수 있는 ${R.grp==='bank'?'은행':'저축은행'} 상품 ${a.n}개 · 평균 ${rateFmt(a.mean)} · 중앙 ${rateFmt(a.median)} · 최고 ${rateFmt(a.max)}`));
      const l2=rateEl('div','rate-rank');
      a.top.forEach((r,i)=>{
        const row=rateEl('div','rate-row');row.append(rateEl('span','etf-rank',String(i+1)));
        const lim=r[4]?`한도 ${(r[4]/1e8>=1?(r[4]/1e8)+'억':(r[4]/1e4).toLocaleString('ko-KR')+'만')} 원`:'한도 없음';
        const mn=r[5]?` · 최소 ${(r[5]/1e4).toLocaleString('ko-KR')}만 원`:'';
        const nm=rateEl('span','rate-name');nm.append(rateEl('b',null,r[0]),rateEl('small',null,`${r[1]} · ${lim}${mn}${r[6]==='3'?' · 가입 일부 제한':''}`));row.append(nm);
        row.append(rateEl('span','rate-v',rateFmt(r[2])),rateEl('span','rate-v2',r[3]!=null?'최고 '+rateFmt(r[3]):''));
        l2.appendChild(row);
      });
      box.appendChild(l2);
      box.appendChild(rateEl('p','rmap-note','최소 가입 금액은 상품의 기타 유의사항 글에서 찾은 값이라 빠지거나 틀릴 수 있습니다. 서민전용·특판 상품은 뺐습니다. 가입 전 금융회사 공시를 꼭 확인하세요.'));
    }
  }
  box.appendChild(rateEl('p','rmap-note','출처: 금융감독원 금융상품 통합비교공시(은행·저축은행), 한국은행 ECOS(예금은행 가중평균금리), 신협중앙회·새마을금고중앙회(약관 미확인 자료, 요청 시 비공개).'));
}
function rateSvg(eco,fm,fhi,flo,dots,day,loan,w){
  const W=Math.round(Math.max(320,Math.min(760,w||640))),H=W<500?210:250,L=40,Rp=14,T=12,B=26;
  const end=new Date(),start=new Date(end.getFullYear()-3,end.getMonth(),1);
  const tx=d=>new Date(d).getTime();
  const e=eco.filter(r=>tx(r[0])>=start.getTime());
  const all=[...e.map(r=>r[1]),...fm.map(r=>r[1]),...fhi.map(r=>r[1]),...flo.map(r=>r[1]),...dots].filter(v=>v!=null);
  const NS='http://www.w3.org/2000/svg';const svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox',`0 0 ${W} ${H}`);svg.setAttribute('class','rate-svg');
  if(!all.length){const t=document.createElementNS(NS,'text');t.setAttribute('x',W/2);t.setAttribute('y',H/2);t.setAttribute('text-anchor','middle');t.textContent='자료가 아직 없습니다';svg.appendChild(t);return svg}
  let lo=Math.floor(Math.min(...all)*2)/2,hi=Math.ceil(Math.max(...all)*2)/2;if(hi-lo<1){hi+=0.5;lo-=0.5}
  const x0=start.getTime(),x1=end.getTime()+20*864e5;
  const X=t=>L+(t-x0)/(x1-x0)*(W-L-Rp),Y=v=>T+(hi-v)/(hi-lo)*(H-T-B);
  const mk=(tag,at)=>{const n=document.createElementNS(NS,tag);for(const k in at)n.setAttribute(k,at[k]);svg.appendChild(n);return n};
  for(let v=lo;v<=hi+1e-9;v+=hi-lo>4?1:0.5){mk('line',{x1:L,x2:W-Rp,y1:Y(v),y2:Y(v),class:'rate-grid'});const t=mk('text',{x:L-4,y:Y(v)+4,'text-anchor':'end',class:'rate-ax'});t.textContent=v.toFixed(1)}
  for(let yv=start.getFullYear()+1;yv<=end.getFullYear();yv++){const xx=X(new Date(yv,0,1).getTime());mk('line',{x1:xx,x2:xx,y1:T,y2:H-B,class:'rate-grid'});const t=mk('text',{x:xx,y:H-8,'text-anchor':'middle',class:'rate-ax'});t.textContent=String(yv)}
  const path=rows=>rows.filter(r=>r[1]!=null).map((r,i)=>`${i?'L':'M'}${X(tx(r[0])).toFixed(1)},${Y(r[1]).toFixed(1)}`).join('');
  // finlife 띠 (날짜가 겹치는 구간)
  const lowBy=new Map(flo.map(r=>[r[0],r[1]]));const band=fhi.filter(r=>lowBy.has(r[0])&&tx(r[0])>=x0);
  if(band.length>1){mk('path',{d:path(band)+band.slice().reverse().map(r=>`L${X(tx(r[0])).toFixed(1)},${Y(lowBy.get(r[0])).toFixed(1)}`).join('')+'Z',class:'rate-band'})}
  if(e.length)mk('path',{d:path(e),class:'rate-eco'});
  const fmr=fm.filter(r=>tx(r[0])>=x0);if(fmr.length>1)mk('path',{d:path(fmr),class:'rate-fl'});
  // 최근 날짜의 금융회사별 점 (겹치지 않게 좌우로 조금씩)
  const dx=X(tx(day||end));const seen={};
  for(const v of dots){const k=Math.round(v*20);seen[k]=(seen[k]||0)+1;const off=((seen[k]-1)%5-2)*3;mk('circle',{cx:dx+off-8,cy:Y(v),r:2.6,class:'rate-dot'})}
  if(fmr.length===1)mk('circle',{cx:X(tx(fmr[0][0]))-8,cy:Y(fmr[0][1]),r:4,class:'rate-flpt'});
  return svg;
}
// ---------------- 소득·자산 (2026-11-27 계획 2단계, KOSIS) ----------------
// 가구 소득·소비(가계동향, 분기) · 자산·부채(가계금융복지, 연) · 지역 소득(지역소득, 연, 네모 칸) · 근로소득(가계동향 근로소득)
const INC_CATS=[['inc:hh','가구 소득·소비','hh'],['inc:assets','자산·부채','assets'],['inc:region','지역 소득','region'],['inc:earned','근로소득','hh']];
const INC_COLORS={'전체':'#111827','1분위':'#2563eb','2분위':'#0891b2','3분위':'#16a34a','4분위':'#d97706','5분위':'#dc2626'};
state.inc={hh:null,assets:null,region:null,loaded:false,measure:{},year:null,view:'growth',sido:null};
const isInc=c=>String(c).startsWith('inc:');
async function incLoad(){
  if(state.inc.loaded)return;state.inc.loaded=true;
  const got=await Promise.allSettled(['hh','assets','region'].map(n=>requestJSON(`./data/kosis/${n}.json`)));
  ['hh','assets','region'].forEach((n,i)=>{state.inc[n]=got[i].status==='fulfilled'?got[i].value:null});
}
const incFmt=(v,unit)=>v==null?'–':Math.abs(v)>=1e4&&/원/.test(unit||'')&&!/만/.test(unit||'')?`${(v/1e4).toLocaleString('ko-KR',{maximumFractionDigits:1})}만`:Number(v).toLocaleString('ko-KR',{maximumFractionDigits:1});
const incPeriod=(d,f)=>f==='Q'?`${d.slice(0,4)}.${Math.floor((+d.slice(5,7)-1)/3)+1}분기`:d.slice(0,4);
function renderInc(){
  const box=id('inc-section');box.replaceChildren();
  const cat=state.cat,conf=INC_CATS.find(c=>c[0]===cat);
  if(!conf)return;
  if(conf[2]==='region'){renderIncRegion(box);return}
  const T=state.inc[conf[2]];
  if(!T){box.appendChild(rateEl('p','rmap-note','자료를 아직 받지 못했습니다 (KOSIS, 주 1회 확인).'));return}
  let keys=Object.keys(T.measures||{});
  if(cat==='inc:earned')keys=keys.filter(k=>['earned','business','transfer'].includes(k));
  else if(cat==='inc:hh')keys=keys.filter(k=>k!=='business'&&k!=='transfer');
  if(!keys.length){box.appendChild(rateEl('p','rmap-note','이 표에서 해당 지표를 찾지 못했습니다.'));return}
  let mk=state.inc.measure[cat];if(!keys.includes(mk))mk=state.inc.measure[cat]=keys[0];
  if(keys.length>1)box.appendChild(rateBtns(keys.map(k=>[k,T.measures[k].name]),mk,v=>{state.inc.measure[cat]=v;renderInc()}));
  const M=T.measures[mk],unit=M.unit||T.unit||'';
  // 최신값 칸: 전체 + 1~5분위. 아래 줄은 1년 전 대비
  const grid=rateEl('div','inc-grid');
  for(const lab of T.split){
    const s=M.series?.[lab];if(!s?.length)continue;
    const [d,v]=s[s.length-1];const back=T.freq==='Q'?4:1;const old=s.length>back?s[s.length-1-back][1]:null;
    const ch=old?((v/old-1)*100):null;
    const c=rateEl('div','inc-tile');c.style.borderTopColor=INC_COLORS[lab]||'#999';
    c.append(rateEl('small',null,lab),rateEl('b',null,incFmt(v,unit)),rateEl('span',ch==null?'':ch>=0?'up':'down',ch==null?incPeriod(d,T.freq):`${incPeriod(d,T.freq)} · 1년 전 대비 ${ch>=0?'+':''}${ch.toFixed(1)}%`));
    grid.appendChild(c);
  }
  box.appendChild(rateEl('h3','rate-h',`${M.name} (${unit})`));
  box.appendChild(grid);
  box.appendChild(incSvg(M.series,T.split,T.freq,box.clientWidth||640));
  const lg=rateEl('div','inc-legend');for(const lab of T.split){if(!M.series?.[lab])continue;const s=rateEl('span',null,lab);s.style.setProperty('--c',INC_COLORS[lab]);lg.appendChild(s)}
  box.appendChild(lg);
  box.appendChild(rateEl('p','rmap-note',`${T.title}. 소득 5분위는 가구를 소득 순으로 다섯 묶음으로 나눈 것(1분위 = 소득 하위 20%). 출처: ${T.source}. 새 자료는 주 1회 확인합니다.`));
}
function incSvg(series,split,freq,w,colors){
  const CC=colors||INC_COLORS;
  const W=Math.round(Math.max(320,Math.min(760,w))),H=W<500?220:260,L=52,R=12,T=12,B=26;
  const NS='http://www.w3.org/2000/svg';const svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox',`0 0 ${W} ${H}`);svg.setAttribute('class','rate-svg');
  const all=split.flatMap(l=>(series?.[l]||[]).map(r=>r[1])).filter(v=>v!=null);
  const ds=[...new Set(split.flatMap(l=>(series?.[l]||[]).map(r=>r[0])))].sort();
  if(!all.length||ds.length<1)return svg;
  let lo=Math.min(...all),hi=Math.max(...all);const pad=(hi-lo)*0.08||1;lo-=pad;hi+=pad;
  const X=d=>L+(ds.length<2?0.5:ds.indexOf(d)/(ds.length-1))*(W-L-R),Y=v=>T+(hi-v)/(hi-lo)*(H-T-B);
  const mk=(tag,at)=>{const n=document.createElementNS(NS,tag);for(const k in at)n.setAttribute(k,at[k]);svg.appendChild(n);return n};
  for(let i=0;i<=4;i++){const v=lo+(hi-lo)*i/4;mk('line',{x1:L,x2:W-R,y1:Y(v),y2:Y(v),class:'rate-grid'});const t=mk('text',{x:L-4,y:Y(v)+4,'text-anchor':'end',class:'rate-ax'});t.textContent=incFmt(v,'원')}
  const step=Math.max(1,Math.ceil(ds.length/(W<500?4:8)));
  ds.forEach((d,i)=>{if(i%step&&i!==ds.length-1)return;const t=mk('text',{x:X(d),y:H-8,'text-anchor':'middle',class:'rate-ax'});t.textContent=incPeriod(d,freq)});
  for(const lab of split){
    const s=(series?.[lab]||[]).filter(r=>r[1]!=null);if(!s.length)continue;
    mk('path',{d:s.map((r,i)=>`${i?'L':'M'}${X(r[0]).toFixed(1)},${Y(r[1]).toFixed(1)}`).join(''),fill:'none',stroke:CC[lab],'stroke-width':lab==='전체'||lab==='한국'?2.4:1.6});
    if(s.length===1)mk('circle',{cx:X(s[0][0]),cy:Y(s[0][1]),r:3,fill:CC[lab]});
  }
  return svg;
}
function renderIncRegion(box){
  const R=state.inc.region;
  if(!R?.sido){box.appendChild(rateEl('p','rmap-note','지역소득 자료를 아직 받지 못했습니다 (KOSIS, 주 1회 확인).'));return}
  const years=(R.years||[]).filter(y=>Object.values(R.sido).some(d=>d.growth?.[y]!=null||d.nominal?.[y]!=null));
  let y=state.inc.year;if(!years.includes(y))y=state.inc.year=years[years.length-1];
  box.appendChild(rateBtns([['growth','실질 성장률'],['pc','1인당 개인소득']],state.inc.view,v=>{state.inc.view=v;renderInc()}));
  box.appendChild(rateBtns(years.slice(-8).map(v=>[v,v+'년']),y,v=>{state.inc.year=v;renderInc()}));
  const nat=R.sido['전국'];const natPc=nat?.pc_personal?.[y];
  const pcView=state.inc.view==='pc';
  const items=Object.entries(R.sido).filter(([n,d])=>n!=='전국'&&d.nominal?.[y]).map(([n,d])=>{
    const pc=d.pc_personal?.[y];const rel=pcView&&pc&&natPc?(pc/natPc-1)*100:null;
    return {key:n,label:n,n:d.nominal[y],v:d.nominal[y],st:{p:pcView?rel:d.growth?.[y],g:d.growth?.[y],pc,nom:d.nominal[y],unit:d.unit_nominal,pcu:d.unit_pc_personal}};
  }).sort((a,b)=>b.v-a.v);
  const tree=rateEl('div','rmap-tree pmap-tree');box.appendChild(tree);
  const scale=pcView?5:1;   // 1인당 개인소득은 전국 평균과의 차이(%)로 칠한다: ±5·±15%
  const big=v=>v==null?'–':`${v>0?'+':''}${v.toFixed(1)}%`;
  const nomText=(v,u)=>v==null?'–':/백만/.test(u||'')?`${(v/1e6).toLocaleString('ko-KR',{maximumFractionDigits:1})}조`:`${Math.round(v).toLocaleString('ko-KR')}${u||''}`;
  const pcText=(v,u)=>v==null?'–':/천/.test(u||'')?`${(v/10).toLocaleString('ko-KR',{maximumFractionDigits:0})}만 원`:`${Math.round(v).toLocaleString('ko-KR')}${u||''}`;
  tmCells(tree,items,{
    stOf:t=>t.st,tone:st=>rmapTone(st?.p==null?null:st.p/scale),isOn:t=>t.key===state.inc.sido,unit:'',
    layouts:(t,st)=>{const nm={cls:'nm',text:t.label},b={cls:'big',text:pcView?pcText(st.pc,st.pcu):big(st.g)},sub={cls:'sub',text:pcView?`전국 대비 ${big(st.p)}`:`GRDP ${nomText(st.nom,st.unit)}`};
      return [[nm,b,sub],[nm,b],[{cls:'mix',text:`${t.label} ${pcView?pcText(st.pc,st.pcu):big(st.g)}`}],[nm]]},
    tipLines:(t,st)=>[`${t.label} ${y}년`,`지역내총생산(명목) ${nomText(st.nom,st.unit)}`,`실질 성장률 ${big(st.g)}`,`1인당 개인소득 ${pcText(st.pc,st.pcu)}`],
    hint:'한 번 더 누르면 아래에 그 지역 정보가 나옵니다',
    go:t=>{state.inc.sido=t.key;renderInc()}});
  const tones=pcView?[['rc-up2','전국보다 +15% 이상'],['rc-up1','+5~15%'],['rc-flat','-5~+5%'],['rc-dn1','-5~-15%'],['rc-dn2','-15% 이하']]:[['rc-up2','+3% 이상'],['rc-up1','+1~3%'],['rc-flat','-1~+1%'],['rc-dn1','-1~-3%'],['rc-dn2','-3% 이하']];
  const lgb=rateEl('div','rmap-legend');box.appendChild(lgb);
  tmLegend(lgb,tones,`칸 크기: 명목 지역내총생산(GRDP) · 색: ${pcView?'1인당 개인소득의 전국 평균 대비 차이':'실질 성장률(전년 대비)'}. ${y}년 기준. 출처: ${R.source}.`);
  // 고른 시도: GRDP + 인구 증감 + 집값 변동
  const sd=state.inc.sido&&R.sido[state.inc.sido];
  if(sd){
    const info=rateEl('div','inc-sido');
    const lines=[`${state.inc.sido} ${y}년: 지역내총생산 ${nomText(sd.nominal?.[y],sd.unit_nominal)}, 실질 성장률 ${big(sd.growth?.[y])}, 1인당 개인소득 ${pcText(sd.pc_personal?.[y],sd.unit_pc_personal)}`];
    const pop=Object.values(state.pop?.items||{}).find(m=>String(m.name||'').startsWith(state.inc.sido)&&m.chg_year!=null);
    if(pop)lines.push(`인구: ${String(pop.name)} 1년 전 대비 ${pop.chg_year>=0?'+':''}${Number(pop.chg_year).toFixed(2)}%`);
    const ap=state.realty?.items?.apt?.[sd.code];
    if(ap&&ap.trade_ppm_yoy!=null)lines.push(`아파트 매매 ㎡당 가격(중앙값): 1년 전 같은 달 대비 ${ap.trade_ppm_yoy>=0?'+':''}${Number(ap.trade_ppm_yoy).toFixed(1)}% (${state.realty?.settled_month||''} 기준)`);
    for(const l of lines)info.appendChild(rateEl('p',null,l));
    box.appendChild(info);
  }
}
// ---------------- 수출입 지도 (2026-11-27 계획 3단계, 관세청) ----------------
// 대륙 → 나라 → 품목(HS 2단위). 크기 = 고른 흐름(수출·수입, 무역수지는 교역액), 색 = 전년 같은 기간 대비(무역수지는 교역액 대비 흑자·적자 비율)
const TMAP_CAT='tmap:trade';
state.tmap={map:undefined,path:[],flow:'e',per:null};
async function renderTmap(){
  const T=state.tmap,tree=id('tmap-tree');
  if(T.map===undefined){tree.textContent='자료를 불러오는 중…';T.map=await requestJSON('./data/customs/map.json').catch(()=>null)}
  const M=T.map;
  const pb=id('tmap-btns');pb.replaceChildren();
  if(!M?.periods){tree.textContent='수출입 지도 자료를 아직 만들지 못했습니다 (관세청 자료를 나라·품목별로 모으는 중).';return}
  if(!M.order.includes(T.per))T.per=M.order.filter(k=>!k.startsWith('m')&&M.periods[k]?.cmp).pop()||M.order[M.order.length-1];   // 기본: 올해 누계(없으면 최근 해)
  pb.appendChild(rateBtns([['e','수출'],['i','수입'],['b','무역수지']],T.flow,v=>{T.flow=v;renderTmap()}));
  pb.appendChild(rateBtns(M.order.slice().reverse().map(k=>[k,M.periods[k].label+(M.periods[k].complete===false?'*':'')]),T.per,v=>{T.per=v;renderTmap()}));
  const P=M.periods[T.per],C=P.cmp?M.periods[P.cmp]:null;
  const [ct,cc]=T.path;
  const f=T.flow;
  const val=(x)=>!x?0:f==='e'?x[0]:f==='i'?x[1]:x[0]+x[1];
  const tone=(cur,old)=>{
    if(f==='b'){const tr=cur[0]+cur[1];return tr?((cur[0]-cur[1])/tr*100):null}
    const a=val(cur),b=val(old);return b>0?((a/b-1)*100):null;
  };
  let items=[],lvl;
  const sumC=(data,filter)=>{const o={};for(const [k,v] of Object.entries(data||{})){if(!filter(k))continue;const g=o[M.continent[k]||'기타']??=[0,0,0];g[0]+=v[0];g[1]+=v[1];g[2]++}return o};
  if(!ct){
    lvl=0;const cur=sumC(P.data,()=>true),old=C?sumC(C.data,()=>true):{};
    items=Object.entries(cur).map(([k,v])=>({key:k,label:k,n:val(v),v:val(v),st:{p:tone(v,old[k]),cur:v,cnt:v[2]}}));
  }else if(!cc){
    lvl=1;items=Object.entries(P.data).filter(([k])=>(M.continent[k]||'기타')===ct).map(([k,v])=>({key:k,label:M.names[k]||k,n:val(v),v:val(v),st:{p:tone(v,C?.data?.[k]),cur:v}}));
  }else{
    lvl=2;const hs=P.data[cc]?.[2]||{},ohs=C?.data?.[cc]?.[2]||{};
    items=Object.entries(hs).map(([h,v])=>({key:h,label:`${h} ${M.hs2[h]||''}`.trim(),n:val(v),v:val(v),st:{p:tone(v,ohs[h]),cur:v}}));
  }
  items=items.filter(t=>t.v>0).sort((a,b)=>b.v-a.v);
  const conts=[...new Set(Object.keys(P.data).map(k=>M.continent[k]||'기타'))];
  tmCrumbs(id('tmap-crumbs'),[{name:'전체'},{name:'대륙',label:ct,options:async()=>conts.map(k=>[k,k])},
    {name:'나라',label:cc?(M.names[cc]||cc):null,options:async()=>Object.keys(P.data).filter(k=>(M.continent[k]||'기타')===ct).sort((a,b)=>val(P.data[b])-val(P.data[a])).map(k=>[k,M.names[k]||k])}],
    T.path,np=>{T.path=np;renderTmap()});
  const usd=v=>v>=1e8?`${(v/1e8).toLocaleString('ko-KR',{maximumFractionDigits:v>=1e10?0:1})}억 달러`:`${(v/1e4).toLocaleString('ko-KR',{maximumFractionDigits:0})}만 달러`;
  const tot=items.reduce((a,t)=>a+t.v,0);
  id('tmap-note').textContent=`${P.label} · ${f==='e'?'수출':f==='i'?'수입':'교역'} ${usd(tot)}`;
  tree.replaceChildren();
  const pc=v=>v==null?'—':`${v>0?'+':''}${Number(v).toFixed(1)}%`;
  const scale=f==='b'?10:3;    // 색 경계: 증감률 ±3·±9%, 무역수지 비율 ±10·±30%
  const narrow=window.matchMedia('(max-width:540px)').matches;
  tmCells(tree,tmLimit(items,narrow?60:120),{
    etcText:t=>usd(t.n),stOf:t=>t.st,tone:st=>rmapTone(st?.p==null?null:st.p/scale*1),isOn:()=>false,unit:'',
    layouts:(t,st)=>{const nm={cls:'nm',text:t.label},b={cls:'big',text:f==='b'?usd(Math.abs(st.cur[0]-st.cur[1])).replace(/^/,st.cur[0]>=st.cur[1]?'흑자 ':'적자 '):usd(val(st.cur))},
      sub={cls:'sub',text:f==='b'?`교역액 대비 ${pc(st.p)}`:`전년 같은 기간 대비 ${pc(st.p)}`};
      return [[nm,b,sub],[nm,b],[{cls:'mix',text:`${tmShort(t.label)} ${f==='b'?pc(st.p):usd(val(st.cur))}`}],[nm]]},
    tipLines:(t,st)=>[t.label,`수출 ${usd(st.cur[0])} · 수입 ${usd(st.cur[1])}`,`무역수지 ${st.cur[0]>=st.cur[1]?'흑자':'적자'} ${usd(Math.abs(st.cur[0]-st.cur[1]))}`,
      ...(f!=='b'?[`전년 같은 기간 대비 ${pc(st.p)}`]:[]),...(st.cnt?[`${st.cnt}개 나라`]:[])],
    hint:lvl<2?'한 번 더 누르면 안으로 들어갑니다':'',
    go:t=>{if(lvl===0)T.path=[t.key];else if(lvl===1)T.path=[ct,t.key];else return;renderTmap()}});
  const b1=scale,b3=scale*3;
  tmLegend(id('tmap-legend'),f==='b'?[['rc-up2',`흑자 ${b3}% 이상`],['rc-up1',`흑자 ${b1}~${b3}%`],['rc-flat',`±${b1}%`],['rc-dn1',`적자 ${b1}~${b3}%`],['rc-dn2',`적자 ${b3}% 이상`]]
    :[['rc-up2',`+${b3}% 이상`],['rc-up1',`+${b1}~${b3}%`],['rc-flat',`-${b1}~+${b1}%`],['rc-dn1',`-${b1}~-${b3}%`],['rc-dn2',`-${b3}% 이하`]],
    `칸 크기: ${f==='e'?'수출액':f==='i'?'수입액':'교역액(수출+수입)'} · 색: ${f==='b'?'무역수지 ÷ 교역액':'전년 같은 기간 대비 증감률'}. 오르면(흑자면) 빨강, 내리면(적자면) 파랑. `+
    `품목은 HS 2단위(류). * 표시 기간은 아직 모든 나라를 받지 못함. 출처: 관세청 품목별·국가별 수출입실적.`);
  id('tmap-note2').textContent=tmTapNote();
}
// ---------------- 국제 무역 (2026-11-27 계획 7단계, WTO) ----------------
// 주요 20개 경제의 평균 관세율(연)과 서비스 수출입(연). 위: 최근 해 순위 막대, 아래: 고른 나라 추이
const WTO_CAT='wto:trade';
const WTO_COLORS=['#111827','#dc2626','#2563eb','#16a34a','#d97706','#7c3aed','#0891b2','#db2777'];
state.wto={data:undefined,ind:'tariff_all',pick:['KOR','USA','CHN','EEC','JPN']};
async function renderWto(){
  const box=id('inc-section');box.replaceChildren();
  const W=state.wto;
  if(W.data===undefined)W.data=await requestJSON('./data/wto/trade.json').catch(()=>null);
  const D=W.data;
  if(!D?.indicators){box.appendChild(rateEl('p','rmap-note','WTO 자료를 아직 받지 못했습니다 (월 1회 확인).'));return}
  const keys=Object.keys(D.indicators);if(!keys.includes(W.ind))W.ind=keys[0];
  box.appendChild(rateBtns(keys.map(k=>[k,D.indicators[k].name.replace(/ \(.*\)$/,'')+(k.startsWith('tariff_')&&k!=='tariff_all'?' · '+(k==='tariff_agri'?'농산물':'비농산물'):'')]),W.ind,v=>{W.ind=v;renderWto()}));
  const I=D.indicators[W.ind],ko=Object.fromEntries(D.economies);
  const last=Object.entries(I.series).map(([iso,s])=>[iso,s[s.length-1]]).filter(([,r])=>r&&r[1]!=null).sort((a,b)=>b[1][1]-a[1][1]);
  box.appendChild(rateEl('h3','rate-h',`${I.name} — 최근 해 (${I.unit})`));
  const mx=Math.max(...last.map(([,r])=>Math.abs(r[1])))||1;
  const bars=rateEl('div','wto-bars');
  for(const [iso,r] of last){
    const row=rateEl('button','wto-bar'+(W.pick.includes(iso)?' on':''));row.type='button';
    const nm=rateEl('span','wto-nm',ko[iso]||iso);const tr=rateEl('span','wto-track');const f=rateEl('span','wto-fill');f.style.width=`${Math.abs(r[1])/mx*100}%`;tr.appendChild(f);
    row.append(nm,tr,rateEl('span','wto-v',`${Number(r[1]).toLocaleString('ko-KR',{maximumFractionDigits:1})} (${r[0].slice(0,4)})`));
    row.addEventListener('click',()=>{W.pick=W.pick.includes(iso)?W.pick.filter(x=>x!==iso):[...W.pick,iso].slice(-8);renderWto()});
    bars.appendChild(row);
  }
  box.appendChild(bars);
  box.appendChild(rateEl('h3','rate-h','고른 나라 추이 (막대를 눌러 넣고 빼기, 최대 8개)'));
  const pick=W.pick.filter(iso=>I.series[iso]);
  const col={};pick.forEach((iso,i)=>col[ko[iso]||iso]=WTO_COLORS[i%WTO_COLORS.length]);
  const ser=Object.fromEntries(pick.map(iso=>[ko[iso]||iso,I.series[iso]]));
  box.appendChild(incSvg(ser,Object.keys(ser),'Y',box.clientWidth||640,col));
  const lg=rateEl('div','inc-legend');for(const [n,c] of Object.entries(col)){const s=rateEl('span',null,n);s.style.setProperty('--c',c);lg.appendChild(s)}box.appendChild(lg);
  box.appendChild(rateEl('p','rmap-note',`${D.note} 출처: ${D.source}.`));
}
async function refresh(){
  state.rmap.cache.clear();state.pmap.idx=null;          // 네모 지도 자료도 새로 받는다
  state.rates.loaded=false;state.rates.series={};state.inc.loaded=false;state.tmap.map=undefined;state.smap.latest=null;state.smap.sec=undefined;         // 예금·대출 금리 순위·그래프 자료도 새로
  const button=id('refresh-button');button.disabled=true;button.classList.add('busy');id('refresh-text').textContent='확인 중…';
  const names=['fx','market','etf','fred','ecos','fsc','worldbank','china','pop','customs','deposit','krx','realty','finlife','kamis'];
  const got=await Promise.allSettled(names.map(n=>requestJSON(n==='etf'?'./data/fsc/etf_summary.json':`./data/${n}/summary.json`)));   // ETF: 금융위원회 자료 (네이버·Yahoo 는 쌓기만)
  names.forEach((n,i)=>{state[n]=got[i].status==='fulfilled'?got[i].value:null});
  await incLoad();
  state.wto.data=await requestJSON('./data/wto/trade.json').catch(()=>null);state.wtoReady=!!state.wto.data;   // 무역 칸은 WTO 자료가 있을 때만                                       // 소득·자산 (KOSIS) — 범주 단추를 만들려면 먼저 읽어야 함
  const fx=got[0];
  if(!categories().some(c=>c.id===state.cat))state.cat=HOME_CAT;
  if(!selExists(state.sel))state.sel=fallbackSel();
  renderCategories();renderStatus();renderTiles();renderSelected();renderEtf();renderDataCount();
  if(!selExists(state.sel)){
    id('top-status').textContent='데이터 읽기 실패';id('top-status').className='top-status warn';
    showNotice(`자료 파일을 가져오지 못했습니다. ${fx.reason?.message||''}. Market_Runner의 게시 상태를 확인해 주세요.`);
    renderCombo();
  } else {
    const item=currentItem();
    id('target-title').textContent=item.kind==='fx'?'내 관심 환율':'내 관심 가격';
    id('target-label').textContent=`기준선 입력 (${item.unit})`;
    const t=targetValue();id('target-input').value=t?String(t):'';
    await loadItem(item);
  }
  button.disabled=false;button.classList.remove('busy');id('refresh-text').textContent='자료 새로 고침';
}
async function loadItem(item){
  const currentRequest=++state.requestId;
  const same=()=>currentRequest===state.requestId&&state.sel.kind===item.kind&&state.sel.id===item.id;
  try{
    const data=await requestJSON(item.file);
    if(!same())return;
    if(item.kind==='realty'){
      // 월별 요약에서 고른 지표만 꺼내 그래프 형식([날짜, 값])으로 바꾼다. 신고가 덜 찬 최근 두 달은 뺀다.
      const lim=state.realty?.settled_month||'9999-99';
      data.daily=(data.monthly?.[realtyMetric(item.type)[0]]||[]).filter(r=>r[1]!==null&&r[0]<=lim).map(r=>[r[0]+'-01',r[1]]);
    }
    state.data=data;
  }catch(_){
    if(!same())return;
    state.data={daily:[],hourly:[]};
  }
  renderSelected();renderCombo();
}

// ---------------- 국내 ETF ----------------
// 전체 약 1,100개는 순위표로 보여 준다. 분류·검색으로 좁히고, 기준을 골라 정렬한다.
// 줄을 누르면 그 종목 그래프를 그린다. 그래프 자료는 누른 종목 것만 불러온다.
const ETF_SORTS=[['d1','전일 대비'],['w','1주 평균 대비'],['m','1달 평균 대비'],['y','1년 평균 대비'],['lo','10년 최저 대비'],['r3','3개월 수익률'],['ms','시가총액']];
function initEtfControls(){
  const sort=id('etf-sort');
  for(const [k,label] of ETF_SORTS){const o=document.createElement('option');o.value=k;o.textContent=label;sort.appendChild(o)}
  sort.value=ETF_SORTS.some(([k])=>k===state.etfSort)?state.etfSort:'d1';
  sort.addEventListener('change',()=>{state.etfSort=sort.value;safeSet('etfSort',sort.value);state.etfShow=20;renderEtf()});
  id('etf-dir').addEventListener('click',()=>{state.etfDesc=!state.etfDesc;safeSet('etfDesc',state.etfDesc?'desc':'asc');state.etfShow=20;renderEtf()});
  id('etf-search').addEventListener('input',e=>{state.etfQuery=e.target.value.trim();state.etfShow=20;renderEtf()});
  id('etf-more').addEventListener('click',()=>{state.etfShow+=20;renderEtf()});
}
function etfRows(){
  const favs=new Set(etfFavs()??etfDefault());
  const q=state.etfQuery.toLowerCase().replace(/\s+/g,'');
  const key=state.etfSort,dir=state.etfDesc?-1:1;
  return Object.entries(state.etf?.items||{})
    .filter(([c,e])=>(state.etfTab==='all'||(state.etfTab==='fav'?favs.has(c):String(e.t)===state.etfTab))
      &&(!q||c.toLowerCase().includes(q)||String(e.n||'').toLowerCase().replace(/\s+/g,'').includes(q)))
    .sort((a,b)=>{
      const x=a[1][key],y=b[1][key];
      const ox=typeof x==='number'&&Number.isFinite(x),oy=typeof y==='number'&&Number.isFinite(y);
      if(ox!==oy)return ox?-1:1;                       // 값이 없는 종목은 맨 아래
      return ox?(x-y)*dir:0;
    });
}
function etfValueText(key,e){
  if(key==='ms')return typeof e.ms==='number'?(e.ms>=10000?`${(e.ms/10000).toFixed(1)}조`:`${Math.round(e.ms).toLocaleString('ko-KR')}억`):'—';
  return pct(e[key]);
}
function renderEtf(){
  const box=id('etf-panel');
  const on=state.cat===ETF_CAT&&state.etf?.items&&state.etfTab;
  box.hidden=!on;
  if(!on)return;
  id('etf-dir').textContent=state.etfDesc?'높은 순 ▼':'낮은 순 ▲';
  const label=etfCatLabel(state.etfTab);
  const rows=etfRows();
  const favs=new Set(etfFavs()??etfDefault());
  const list=id('etf-list');list.replaceChildren();
  const key=state.etfSort;
  id('etf-title').textContent=`${label} 상품 ${rows.length.toLocaleString('ko-KR')}개`;
  rows.slice(0,state.etfShow).forEach(([code,e],i)=>{
    const row=document.createElement('div');
    row.className='etf-row'+(state.sel.kind==='etf'&&state.sel.id===code?' selected':'');
    const main=document.createElement('button');main.type='button';main.className='etf-main';
    const rank=document.createElement('span');rank.className='etf-rank';rank.textContent=String(i+1);
    const name=document.createElement('span');name.className='etf-name';
    const nm=document.createElement('b');nm.textContent=e.n||code;
    const sub=document.createElement('small');sub.textContent=`${code} · ${state.etf.tabs?.[e.t]||''}${e.c?'':' · 과거 자료 수집 중'}`;
    name.append(nm,sub);
    const price=document.createElement('span');price.className='etf-price';
    price.textContent=typeof e.p==='number'?e.p.toLocaleString('ko-KR'):'—';
    const val=document.createElement('span');val.className='etf-val '+(key==='ms'?'':signClass(e[key]));
    val.textContent=etfValueText(key,e);
    main.append(rank,name,price,val);
    main.addEventListener('click',()=>{
      selectItem(etfItem(code));
      id('combo-section').scrollIntoView({behavior:'smooth',block:'start'});
    });
    const star=document.createElement('button');star.type='button';star.className='etf-star'+(favs.has(code)?' on':'');
    star.textContent=favs.has(code)?'★':'☆';
    star.setAttribute('aria-label',favs.has(code)?'관심 ETF에서 빼기':'관심 ETF에 넣기');
    star.addEventListener('click',()=>toggleFav(code));
    row.append(main,star);
    list.appendChild(row);
  });
  if(!rows.length){const p=document.createElement('p');p.className='etf-empty';p.textContent='조건에 맞는 ETF가 없습니다.';list.appendChild(p)}
  const more=id('etf-more');
  more.hidden=rows.length<=state.etfShow;
  more.textContent=`20개 더 보기 (${Math.min(state.etfShow,rows.length)}/${rows.length})`;
  id('etf-head-val').textContent=ETF_SORTS.find(([k])=>k===key)?.[1]||'';
}
// ETF 범주의 위쪽 칸: 관심 ETF, 전체, 네이버 분류 7개. 칸을 누르면 그 분류의 상품 목록이 아래에 펼쳐진다.
function etfCatLabel(k){
  if(k==='fav')return '관심 ETF';
  if(k==='all')return '전체 ETF';
  return state.etf?.tabs?.[k]||'기타';
}
function median(arr){
  const v=arr.filter(x=>typeof x==='number'&&Number.isFinite(x)).sort((a,b)=>a-b);
  if(!v.length)return null;
  const m=v.length>>1;return v.length%2?v[m]:(v[m-1]+v[m])/2;
}
function renderEtfCats(){
  id('list-title').textContent='ETF 분류';
  id('list-desc').textContent='분류를 누르면 그 분류의 상품 목록이 아래에 펼쳐집니다. 칸의 % 는 그 분류 상품들의 전일 대비 중앙값입니다. ☆로 관심 ETF를 고릅니다(이 브라우저에만 저장).';
  id('list-unit').hidden=true;
  id('list-more').hidden=true;
  const grid=id('currency-grid');grid.replaceChildren();grid.classList.add('etf-cats');
  const items=state.etf?.items||{};
  const favs=new Set(etfFavs()??etfDefault());
  const keys=['fav','all',...Object.keys(state.etf?.tabs||{})];
  for(const k of keys){
    const list=Object.entries(items).filter(([c,e])=>k==='all'||(k==='fav'?favs.has(c):String(e.t)===k)).map(([,e])=>e);
    if(!list.length&&k!=='fav')continue;
    const on=state.etfTab===k;
    const btn=document.createElement('button');btn.type='button';
    btn.className='etf-cat'+(on?' selected':'');
    btn.setAttribute('aria-expanded',on?'true':'false');
    const up=list.filter(e=>e.d1>0).length,down=list.filter(e=>e.d1<0).length;
    const med=median(list.map(e=>e.d1));
    const ms=list.reduce((t,e)=>t+(e.ms||0),0);
    const name=document.createElement('span');name.className='etf-cat-name';
    name.textContent=`${k==='fav'?'★ ':''}${etfCatLabel(k)}`;
    const cnt=document.createElement('small');cnt.textContent=`${list.length}개`;
    name.appendChild(cnt);
    const mid=document.createElement('b');mid.className='etf-cat-med '+signClass(med);mid.textContent=pct(med);
    const sub=document.createElement('span');sub.className='etf-cat-sub';
    sub.innerHTML=`<span class="up">▲${up}</span> <span class="down">▼${down}</span> · ${ms>=10000?(ms/10000).toFixed(1)+'조':Math.round(ms).toLocaleString('ko-KR')+'억'}`;
    const arrow=document.createElement('i');arrow.className='etf-cat-arrow';arrow.textContent=on?'▲':'▼';
    btn.append(name,mid,sub,arrow);
    btn.addEventListener('click',()=>{
      state.etfTab=on?'':k;safeSet('etfTab',state.etfTab);state.etfShow=20;state.etfQuery='';id('etf-search').value='';
      renderEtfCats();renderEtf();renderPicker();
      if(!on)id('etf-panel').scrollIntoView({behavior:'smooth',block:'start'});
    });
    grid.appendChild(btn);
  }
}
function renderOtherStatus(){
  const top=id('top-status');
  if(String(state.cat).startsWith('hub:')){setTop(state.realty?.generated_at,'건축HUB 자료 준비 중',false);showNotice('');return}
  if(isPmap(state.cat)){
    const s=state.pop,t=inKorea(s?.generated_at,true),ok=!!state.pmap.idx;
    setTop(s?.generated_at,`주민등록 인구 ${t} 수집`,ok);
    id('footer-updated').textContent=`마지막 수집 실행 ${t}`;
    showNotice(ok?'':'인구 지도 자료(시군구·읍면동)는 관제기가 받는 중입니다. 한 달에 한 번, 약 550번 요청해 만듭니다.');
    return;
  }
  if(isRealtyCat(state.cat)||isRmap(state.cat)){
    const s=state.realty;
    const t=inKorea(s?.generated_at,true);
    const pr=s?.progress||{};
    const done=Object.values(pr).reduce((a,v)=>a+v[0],0),total=Object.values(pr).reduce((a,v)=>a+v[1],0);
    setTop(s?.generated_at,`실거래 ${t} 수집`,!(done<total));
    id('footer-updated').textContent=`마지막 수집 실행 ${t}`;
    showNotice(done<total?`과거 실거래 자료 수집 중: ${(done/total*100).toFixed(1)}% (${done.toLocaleString('ko-KR')}/${total.toLocaleString('ko-KR')}, 시군구·월 단위, 최근 달부터). 관제기 부담을 줄이려고 나눠서(약 2~3주) 받습니다. 시도·전국 값은 그 안의 시군구를 모두 받은 달만 계산합니다.`:'');
    return;
  }
  const items=itemsOf(state.cat);
  const kinds=[...new Set(items.map(i=>i.kind))];
  const s=kinds.map(k=>state[k]).filter(Boolean);
  const t=inKorea(s.map(x=>x.generated_at).sort().pop(),true);
  const ok=items.filter(i=>state[i.kind]?.items?.[i.id]?.last).length;
  const errs=s.reduce((a,x)=>a+(x.errors?.length||0),0);
  setTop(s.map(x=>x.generated_at).sort().pop(),`${ok}/${items.length} 항목 · ${t} 수집`,ok===items.length);
  id('footer-updated').textContent=`마지막 수집 실행 ${t}`;
  showNotice(ok===items.length?'':`지표 수집 ${ok}/${items.length}종 성공${errs?` · 오류 ${errs}건`:''}`);
}
function renderEtfStatus(){
  const top=id('top-status'),s=state.etf;
  if(!s?.generated_at){top.textContent='최초 수집 필요';top.className='top-status warn';showNotice('');return}
  const t=inKorea(s.generated_at,true);
  setTop(s.generated_at,`${s.count}개 · ${t} 수집`,!s.pending);
  id('footer-updated').textContent=`마지막 수집 실행 ${t}`;
  showNotice(s.pending?`ETF 과거 자료 수집 중: ${s.with_history}/${s.count}개 완료. 관제기 부담을 줄이려고 하루 300개씩 나눠 받습니다. 끝나지 않은 종목은 평균 대비·10년 최저가 비어 있습니다.`:'');
}

// ---------------- 그래프 ----------------
// 장기와 단기를 한 그래프에 겹쳐 그린다.
//  - 세로 눈금(값)은 두 선이 함께 쓴다. 같은 높이는 같은 값이다.
//  - 가로 눈금(날짜)은 따로 쓴다. 검은 선(장기)은 아래쪽 날짜, 빨간 선(단기)은 위쪽 날짜를 따른다.
//  - 환율의 단기 선은 시간별 자료, 시장 지표의 단기 선은 일별 자료의 최근 구간이다.
const COLORS={daily:{color:'#111827',soft:'rgba(17,24,39,.5)'},hourly:{color:'#d34b58',soft:'#d34b5866'}};
const SOURCE_NAME={kamis:'KAMIS 농산물유통정보 (한국농수산식품유통공사, 전국 평균 소매가격) — 약관 미확인 자료, 요청 시 비공개',finlife:'금융감독원 금융상품 통합비교공시',fx:'Source: ECB statistics',market:'Yahoo Finance 일별 종가',etf:'금융위원회 증권상품시세 (공공데이터포털)',
  fred:'FRED (미국 세인트루이스 연준)',ecos:'한국은행 ECOS',china:'한국은행 ECOS 국제 통계·Yahoo Finance',pop:'행정안전부 주민등록 인구',deposit:'출처: 신협중앙회 예금 금리비교·새마을금고중앙회 금고별 금리안내 (약관 미확인 자료, 요청 시 비공개)',customs:'관세청 품목별 국가별 수출입',fsc:'금융위원회 지수·채권 시세 (공공데이터포털)',worldbank:'세계은행 원자재 가격 (Pink Sheet)',krx:'한국거래소(KRX) 석유시장 일별매매정보',bond:'금융위원회 채권발행정보(한국예탁결제원)',realty:'국토교통부 실거래가 월별 요약'};
// 선을 잇는 최대 간격: 이보다 멀리 떨어진 점은 잇지 않는다 (빠진 구간 표시)
const GAP_DAYS={D:6,W:15,M:70,Q:200,A:400};
function seriesOf(chart){
  const kind=state.sel.kind,fx=kind==='fx';
  const gap=(GAP_DAYS[currentItem().freq||'D']||6)*86400000;
  // 환율 (2026-11-27): 유럽중앙은행(ECB) 기준환율. 유로/원은 ECB 원래 값, 그 밖의 통화는 유로를 거친 교차환율. 시간별 시세(Yahoo)는 게시하지 않아 단기 선도 일별 값
  const fxSrc=fx?(state.sel.id==='EUR'?'Source: ECB statistics':'Source: ECB statistics · ECB 기준 환율로 계산'):'';
  const fxHourly=fx&&Array.isArray(state.data?.hourly)&&state.data.hourly.length>0;
  if(chart==='daily')return {...COLORS.daily,label:'장기',raw:'daily',gap,withTime:false,source:fx?fxSrc:(MACRO.includes(kind)&&state.data?.source)||SOURCE_NAME[kind]||''};   // 지표 파일에 출처가 있으면 그것을 쓴다 (최저임금 등)
  return {...COLORS.hourly,label:'단기',raw:fxHourly?'hourly':'daily',gap:fxHourly?5*3600000:gap,withTime:fxHourly,
    source:fx?fxSrc:SOURCE_NAME[kind]||''};
}
function allRows(chart){
  const raw=state.data?.[seriesOf(chart).raw];
  const mult=currentItem().mult;
  return (Array.isArray(raw)?raw:[]).map(r=>[parsedTimestamp(r[0]),Number(r[1])*mult])
    .filter(([t,v])=>Number.isFinite(t)&&(MACRO.includes(state.sel.kind)?Number.isFinite(v):validNumber(v))).sort((a,b)=>a[0]-b[0]);
}
function getChartRows(chart){
  // 그래프는 한국 시각으로 어제까지만 그린다. 오늘 값은 현황 목록에만 나온다.
  const kstNow=new Date(Date.now()+9*3600000);
  const kstTodayStartUTC=Date.UTC(kstNow.getUTCFullYear(),kstNow.getUTCMonth(),kstNow.getUTCDate())-9*3600000;
  const cutoff=new Date();
  if(chart==='daily')cutoff.setFullYear(cutoff.getFullYear()-state.dailyYears);
  else cutoff.setTime(kstTodayStartUTC-state.hourlyDays*86400000);
  return allRows(chart).filter(([t])=>t>=cutoff.getTime()&&t<kstTodayStartUTC);
}

function formatForAxis(v){
  if(Math.abs(v)>=1000)return Math.round(v).toLocaleString('ko-KR');
  if(Math.abs(v)>=100)return v.toFixed(1);
  if(Math.abs(v)>=10)return v.toFixed(2);
  return v.toFixed(3);
}

// 이동평균: 그 시점까지 최근 N일 동안의 값을 평균한 것. 장기 100일, 단기 10일.
// 화면에 보이는 기간보다 앞선 자료까지 써서 계산한다. N일치 자료가 차지 않은 앞부분은 그리지 않는다.
const MA_DAYS={daily:100,hourly:10};
function movingAverage(chart,visible){
  const all=allRows(chart);
  if(!all.length||!visible.length)return [];
  const W=MA_DAYS[chart]*86400000,first=all[0][0];
  const sums=[0];
  for(const [,v] of all)sums.push(sums[sums.length-1]+v);
  let lo=0,hi=-1;const out=[];
  for(const [t] of visible){
    while(hi+1<all.length&&all[hi+1][0]<=t)hi++;
    while(lo<=hi&&all[lo][0]<=t-W)lo++;
    if(t-W<first||hi<lo)continue;
    out.push([t,(sums[hi+1]-sums[lo])/(hi-lo+1)]);
  }
  return out;
}
function sharedRange(lists){
  let min=Infinity,max=-Infinity;
  for(const rows of lists)for(const [,v] of rows){if(v<min)min=v;if(v>max)max=v}
  if(min===Infinity)return null;
  const pad=Math.max((max-min)*.08,Math.abs(max)*.004,0.0001);
  return {yMin:min>=0?Math.max(0,min-pad):min-pad,yMax:max+pad};   // 음수 값(금리차 등)은 0 아래까지 그린다
}
function buildScale(rows,space,plotW,plotH,range){
  if(!rows.length||!range)return null;
  const minT=rows[0][0],maxT=rows[rows.length-1][0];
  const {yMin,yMax}=range;
  return {minT,maxT,yMin,yMax,
    x:t=>space.left+(maxT===minT?0.5:(t-minT)/(maxT-minT))*plotW,
    y:p=>space.top+(yMax-p)/(yMax-yMin)*plotH};
}
function nearestIndex(rows,t){
  let lo=0,hi=rows.length;
  while(lo<hi){const mid=(lo+hi)>>1;if(rows[mid][0]<t)lo=mid+1;else hi=mid}
  return lo===0?0:lo===rows.length?rows.length-1:(t-rows[lo-1][0]<rows[lo][0]-t?lo-1:lo);
}
// 그래프 날짜 눈금 (한국 날짜 기준, 달력에 맞춘 고른 간격)
//  - 장기(아래쪽): 20년은 4년, 10년은 2년, 5년은 1년, 3년은 6개월, 1년은 3개월마다
//  - 단기(위쪽): 1년은 분기(3개월), 6개월·3개월은 1개월, 1개월은 1주(월요일), 1주는 1일마다
const KST_MS=9*3600000;
function kstParts(t){const d=new Date(t+KST_MS);return {y:d.getUTCFullYear(),m:d.getUTCMonth(),d:d.getUTCDate(),w:d.getUTCDay()}}
function kstTime(y,m,d){return Date.UTC(y,m,d)-KST_MS}
function tickRule(chart){
  if(chart==='daily'){
    const yrs=state.dailyYears;
    return yrs>=20?{unit:'year',step:4}:yrs>=10?{unit:'year',step:2}:yrs>=5?{unit:'year',step:1}:yrs>=3?{unit:'month',step:6}:{unit:'month',step:3};
  }
  const days=state.hourlyDays;
  return days>=365?{unit:'month',step:3}:days>=90?{unit:'month',step:1}:days>=30?{unit:'week',step:1}:{unit:'day',step:1};
}
function makeTicks(minT,maxT,rule){
  const out=[];const p=kstParts(minT);
  if(rule.unit==='year'){
    let y=p.y;if(kstTime(y,0,1)<minT)y++;
    while(y%rule.step!==0)y++;
    for(;kstTime(y,0,1)<=maxT;y+=rule.step)out.push(kstTime(y,0,1));
  }else if(rule.unit==='month'){
    let y=p.y,m=p.m;if(kstTime(y,m,1)<minT){m++;}
    while(m%rule.step!==0)m++;
    for(;;m+=rule.step){const t=kstTime(y+Math.floor(m/12),m%12,1);if(t>maxT)break;out.push(t)}
  }else{
    let t=kstTime(p.y,p.m,p.d);if(t<minT)t+=86400000;
    if(rule.unit==='week')while(kstParts(t).w!==1)t+=86400000;     // 월요일
    const gap=(rule.unit==='week'?7:1)*86400000*rule.step;
    for(;t<=maxT;t+=gap)out.push(t);
  }
  return out;
}
function tickLabel(t,rule,chart){
  const p=kstParts(t),mm=String(p.m+1).padStart(2,'0'),dd=String(p.d).padStart(2,'0');
  if(rule.unit==='year')return String(p.y);
  if(rule.unit==='month')return `${String(p.y).slice(2)}.${mm}`;          // 예: 24.07
  return `${mm}.${dd}`;
}
function renderCombo(){
  const canvas=id('combo-chart');if(!canvas)return;
  const wrap=id('combo-chart-wrap');
  const width=Math.max(10,Math.round(wrap.clientWidth));
  const height=Math.max(10,Math.round(wrap.clientHeight));
  const dpr=Math.min(window.devicePixelRatio||1,2);
  canvas.width=width*dpr;canvas.height=height*dpr;
  const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,width,height);
  const item=currentItem();
  const SERIES={daily:seriesOf('daily'),hourly:seriesOf('hourly')};
  const mobile=width<480;
  const side=mobile?6:10;                    // 세로 눈금 숫자는 그래프 안쪽에 적으므로 왼쪽 여백이 거의 없다
  const space={left:side,right:mobile?8:12,top:32,bottom:34};   // 오른쪽 눈금은 왼쪽과 같아서 없앰
  const AXIS_FONT=(mobile?'12px':'13px')+' system-ui,sans-serif';
  const plotW=Math.max(1,width-space.left-space.right);
  const plotH=Math.max(1,height-space.top-space.bottom);
  const rows={daily:getChartRows('daily'),hourly:getChartRows('hourly')};
  const ma={daily:movingAverage('daily',rows.daily),hourly:movingAverage('hourly',rows.hourly)};
  const range=sharedRange([rows.daily,rows.hourly,ma.daily,ma.hourly]);
  const scale={daily:buildScale(rows.daily,space,plotW,plotH,range),hourly:buildScale(rows.hourly,space,plotW,plotH,range)};
  state.combo={rows,scale,space,plotW,plotH,width,height};
  updateStats('daily',rows.daily);updateStats('hourly',rows.hourly);
  const tooltip=id('combo-tooltip');
  const cap=id('combo-caption');
  if(!scale.daily&&!scale.hourly){
    ctx.fillStyle='#728199';ctx.font='15px system-ui,sans-serif';ctx.textAlign='center';
    ctx.fillText('수집된 자료가 없습니다',width/2,height/2-8);
    ctx.font='13px system-ui,sans-serif';
    ctx.fillText('자료 수집 완료 후 그래프가 표시됩니다',width/2,height/2+15);
    tooltip.hidden=true;
    cap.textContent='자료 없음 · 공개 API가 제공하지 않는 구간은 임의 보정하지 않습니다.';
    return;
  }
  // 세로 눈금: 두 선이 함께 쓰므로 왼쪽에만 적는다.
  ctx.font=AXIS_FONT;ctx.lineWidth=1;
  for(let i=0;i<=4;i++){
    const yp=space.top+plotH*i/4;
    const label=formatForAxis(range.yMax-(range.yMax-range.yMin)*i/4);
    ctx.beginPath();ctx.strokeStyle='#e7ebf0';ctx.moveTo(space.left,yp);ctx.lineTo(width-space.right,yp);ctx.stroke();
  }
  // 세로 눈금 숫자는 선을 다 그린 뒤 그래프 안에 적는다 (아래 drawAxisLabels).
  const drawAxisLabels=()=>{
    ctx.font=AXIS_FONT;ctx.textAlign='left';
    for(let i=0;i<=4;i++){
      const yp=space.top+plotH*i/4;
      const label=formatForAxis(range.yMax-(range.yMax-range.yMin)*i/4);
      const ty=i===0?yp+15:yp-5;              // 맨 위 숫자는 줄 아래, 나머지는 줄 위
      const tw=ctx.measureText(label).width;
      ctx.fillStyle='rgba(255,255,255,.8)';ctx.fillRect(space.left+2,ty-12,tw+6,16);
      ctx.fillStyle='#5f6d80';ctx.fillText(label,space.left+5,ty);
    }
  };
  // 회색 띠: 단기 선이 보여 주는 기간이 장기 그래프(위쪽 날짜)에서 어디인지 표시한다.
  // 단기를 6개월로 줄이면 띠도 6개월만큼으로 줄어든다. 세로로는 그래프 칸 전체를 칠한다.
  if(scale.daily&&scale.hourly){
    const from=Math.max(scale.hourly.minT,scale.daily.minT),to=Math.min(scale.hourly.maxT,scale.daily.maxT);
    if(to>=from){
      const x1=Math.min(scale.daily.x(from),space.left+plotW-4),x2=Math.max(scale.daily.x(to),x1+4);
      ctx.fillStyle='rgba(120,132,150,.18)';
      ctx.fillRect(x1,space.top,Math.min(x2,space.left+plotW)-x1,plotH);
    }
  }
  // 날짜: 위쪽은 장기, 아래쪽은 단기 기준.
  // 날짜: 아래쪽은 장기(검정), 위쪽은 단기(빨강). 겹치는 글자는 건너뛴다.
  for(const chart of ['daily','hourly']){
    const s=scale[chart];if(!s)continue;
    const rule=tickRule(chart);
    const y=chart==='daily'?height-10:space.top-11;
    ctx.fillStyle=SERIES[chart].color;
    let lastRight=-Infinity;
    for(const t of makeTicks(s.minT,s.maxT,rule)){
      const label=tickLabel(t,rule,chart);
      const w=ctx.measureText(label).width;
      const xp=s.x(t);
      let left=xp-w/2;
      left=Math.max(space.left,Math.min(left,width-space.right-w));   // 양 끝에서 잘리지 않게
      if(left<lastRight+8)continue;
      ctx.textAlign='left';ctx.fillText(label,left,y);
      // 눈금 자리를 짧은 선으로 표시
      ctx.beginPath();ctx.strokeStyle=SERIES[chart].soft;ctx.lineWidth=1;
      const y0=chart==='daily'?space.top+plotH:space.top;
      ctx.moveTo(xp,y0);ctx.lineTo(xp,y0+(chart==='daily'?5:-5));ctx.stroke();
      lastRight=left+w;
    }
  }
  // 이동평균선(점선, 선과 같은 색)과 관심 기준선(보라색).
  for(const chart of ['daily','hourly']){
    const s=scale[chart];if(!s||!ma[chart].length)continue;
    let previous=null;
    ctx.beginPath();ctx.strokeStyle=SERIES[chart].soft;ctx.setLineDash([5,4]);ctx.lineWidth=1.4;
    for(const [t,v] of ma[chart]){
      if(previous===null || t-previous>SERIES[chart].gap)ctx.moveTo(s.x(t),s.y(v));
      else ctx.lineTo(s.x(t),s.y(v));
      previous=t;
    }
    ctx.stroke();ctx.setLineDash([]);
  }
  const userTarget=targetValue();
  let targetDrawn=false;
  if(userTarget && userTarget>=range.yMin && userTarget<=range.yMax){
    const yy=space.top+(range.yMax-userTarget)/(range.yMax-range.yMin)*plotH;targetDrawn=true;
    ctx.beginPath();ctx.strokeStyle='#ad74ca';ctx.lineWidth=1.4;ctx.setLineDash([2,4]);
    ctx.moveTo(space.left,yy);ctx.lineTo(space.left+plotW,yy);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle='#8d4fb0';ctx.font='12px system-ui,sans-serif';ctx.textAlign='left';
    ctx.fillText('관심 기준선',space.left+4,yy-4);
    ctx.font=AXIS_FONT;
  }
  // 선: 빠진 날짜·시간은 잇지 않는다.
  for(const chart of ['daily','hourly']){
    const s=scale[chart];if(!s)continue;
    let previous=null;
    ctx.beginPath();ctx.lineWidth=chart==='daily'?1.9:1.6;ctx.strokeStyle=SERIES[chart].color;ctx.lineJoin='round';
    for(const [t,v] of rows[chart]){
      if(previous===null || t-previous>SERIES[chart].gap)ctx.moveTo(s.x(t),s.y(v));
      else ctx.lineTo(s.x(t),s.y(v));
      previous=t;
    }
    ctx.stroke();
    if(rows[chart].length===1){
      ctx.beginPath();ctx.arc(s.x(rows[chart][0][0]),s.y(rows[chart][0][1]),3,0,Math.PI*2);ctx.fillStyle=SERIES[chart].color;ctx.fill();
    }
  }
  drawAxisLabels();
  // 터치한 위치: 손가락에 가까운 선 하나에만 동그라미와 값을 표시한다.
  const hoverChart=scale[state.hoverChart]?state.hoverChart:(scale.daily?'daily':'hourly');
  if(state.hoverP!==null&&scale[hoverChart]){
    const s=scale[hoverChart];
    const r=rows[hoverChart][nearestIndex(rows[hoverChart],s.minT+(s.maxT-s.minT)*state.hoverP)];
    const xx=s.x(r[0]),yy=s.y(r[1]);
    ctx.beginPath();ctx.strokeStyle='#8898aa';ctx.lineWidth=1;ctx.setLineDash([3,4]);
    ctx.moveTo(xx,space.top);ctx.lineTo(xx,space.top+plotH);ctx.stroke();ctx.setLineDash([]);
    ctx.beginPath();ctx.arc(xx,yy,4.6,0,2*Math.PI);ctx.fillStyle='#fff';ctx.fill();
    ctx.strokeStyle=SERIES[hoverChart].color;ctx.lineWidth=2.2;ctx.stroke();
    tooltip.replaceChildren();
    const line=document.createElement('div');
    const dot=document.createElement('i');dot.style.background=SERIES[hoverChart].color;
    line.append(dot,`${SERIES[hoverChart].label} ${inKorea(new Date(r[0]).toISOString(),SERIES[hoverChart].withTime)} · ${(item.kind==='fx'||item.kind==='market'||item.kind==='etf')?prettyRate(r[1]):prettyValue(r[1])}${item.suffix}`);
    tooltip.appendChild(line);
    tooltip.hidden=false;
    const tw=tooltip.offsetWidth||200;
    tooltip.style.left=Math.max(2,Math.min(width-tw-2,xx+(xx>width/2?-tw-10:10)))+'px';
    tooltip.style.top=(space.top+4)+'px';
  } else tooltip.hidden=true;
  const span=(chart)=>{
    const s=scale[chart];
    return s?`${inKorea(new Date(s.minT).toISOString())} ~ ${inKorea(new Date(s.maxT).toISOString(),SERIES[chart].withTime)}`:'자료 없음';
  };
  cap.textContent=`장기(검정): ${SERIES.daily.source} · ${span('daily')} / 단기(빨강): ${SERIES.hourly.source} · ${span('hourly')} · 회색 띠는 장기 그래프에서 단기 구간의 위치 · 점선은 이동평균(장기 ${MA_DAYS.daily}일, 단기 ${MA_DAYS.hourly}일)${targetDrawn?' · 보라색 점선은 관심 기준선':''} · 터치하여 시점 확인`;
}
function updateStats(chart,rows){
  const cells=id(chart+'-stats').querySelectorAll('strong');
  if(!rows.length){cells.forEach(x=>x.textContent='—');return}
  let min=Infinity,max=-Infinity,total=0;
  for(const [,v] of rows){min=Math.min(min,v);max=Math.max(max,v);total+=v}
  const f=['fx','market','etf'].includes(state.sel.kind)?prettyRate:prettyValue;
  const vals=[f(min),f(total/rows.length),f(max),rows.length.toLocaleString('ko-KR')];
  cells.forEach((cell,index)=>cell.textContent=vals[index]);
}
function onPointer(e){
  const info=state.combo;if(!info||(!info.scale.daily&&!info.scale.hourly))return;
  const rect=e.currentTarget.getBoundingClientRect();
  const p=Math.max(0,Math.min(1,(e.clientX-rect.left-info.space.left)/info.plotW));
  // 손가락 높이에 더 가까운 선을 고른다.
  const py=e.clientY-rect.top;
  let best=null,bestGap=Infinity;
  for(const chart of ['daily','hourly']){
    const s=info.scale[chart];if(!s)continue;
    const rows=info.rows[chart];
    const r=rows[nearestIndex(rows,s.minT+(s.maxT-s.minT)*p)];
    const gap=Math.abs(s.y(r[1])-py);
    if(gap<bestGap){bestGap=gap;best=chart}
  }
  if(state.hoverP!==p||state.hoverChart!==best){state.hoverP=p;state.hoverChart=best;renderCombo()}
}


// ---------------- 부동산 가격 분포 (네모 지도, v2 2026-11-26) ----------------
// 부동산의 기본 화면. 아파트·연립·다세대·토지 각각:
// 왼쪽: 네모 칸(시도 → 시군구 → 법정동 → 단지/건물/지목). 칸 크기는 고른 연도의 거래 건수.
// 오른쪽: ㎡당 가격 분포 곡선(가로 ㎡당 가격, 세로 거래 비중). 곡선 아래 점 하나가 거래 하나(연도마다 색·모양이 다름).
// 아래: 점을 누르거나 맨 아래 칸을 고르면 그 단지(건물·지목)의 장기 추이. 환율 그래프처럼 아래 날짜는 전체 기간,
//       위 날짜는 최근 구간, 회색 띠는 최근 구간의 위치.
const RMAP_PREFIX='rmap:';
// 소분류: [자료 이름, 이름, 맨 아래 단계 이름]. 단독·다가구는 이름이 없어 맨 아래가 주택 유형(단독/다가구)
// 주택 종류(소분류)와 거래 유형(매매·전세·월세)을 따로 고른다 (2026-11-26). 마지막 단계 이름(단독·다가구는 법정동까지)
const RMAP_BASES=[['apt','아파트','단지'],['offi','오피스텔','건물'],['rh','빌라(연립·다세대)','건물'],['sh','단독·다가구',null],['land','토지','지목']];
const RMAP_DEALS=[['trade','매매'],['jeonse','전세'],['wolse','월세']];
const rmapKindOf=(b,d)=>b==='land'?'land':`${b}_${d}`;
const rmapUnitWon=()=>state.rmap.deal==='wolse'?1:10000;          // 분포 값 1 = 몇 원 (월세는 원/㎡, 나머지는 만원/㎡)
const isRmap=c=>String(c).startsWith(RMAP_PREFIX);
const RMAP_CAT=RMAP_PREFIX+'price';                   // 중분류 '가격'
const RMAP_COLORS=['#1f6feb','#d1495b','#2a9d8f','#e9a03b','#7b5ea7','#5c677d'];
const RMAP_SHAPES=['circle','triangle','square','diamond','ring','cross'];
state.rmap={kind:'apt_trade',base:'apt',deal:'trade',path:[],years:null,idx:null,pop:null,cache:new Map(),view:null,hoverX:null,dots:[],
  long:null,longMode:'price',longShort:12,longHide:new Set(),longHover:null};
const rmapKindLabel=()=>{const r=state.rmap;return (RMAP_BASES.find(x=>x[0]===r.base)?.[1]||r.base)+(r.base==='land'?'':' '+(RMAP_DEALS.find(x=>x[0]===r.deal)?.[1]||''))};
const rmapLeafLabel=()=>RMAP_BASES.find(x=>x[0]===state.rmap.base)?.[2];
const rmapMaxDepth=()=>rmapLeafLabel()?4:3;          // 단독·다가구는 법정동까지
async function rmapGet(path){
  const c=state.rmap.cache;
  if(c.has(path))return c.get(path);
  const p=requestJSON(path).catch(()=>{c.delete(path);return null});   // 실패는 기억하지 않는다 (자료가 나중에 생기면 다시 받음)
  c.set(path,p);
  return p;
}
function rmapCounts(){return state.rmap.idx?.counts?.[state.rmap.kind]||{}}
function rmapYearsOf(path){
  const counts=rmapCounts();
  const sggs=path.length>=2?[path[1]]:Object.keys(counts).filter(c=>!path.length||c.slice(0,2)===path[0]);
  const ys=new Set();
  for(const s of sggs)for(const [y,n] of Object.entries(counts[s]||{}))if(n)ys.add(y);
  return [...ys].sort();
}
function rmapCount(sggs,years){
  const counts=rmapCounts();
  let n=0;for(const s of sggs)for(const y of years)n+=counts[s]?.[y]||0;
  return n;
}
function rmapSel(path){
  const all=rmapYearsOf(path);
  let ys=[...(state.rmap.years||[])].filter(y=>all.includes(y)).sort();
  if(!ys.length&&all.length){const last=all.at(-1);ys=[last];const back=String(+last-5);if(all.includes(back))ys.unshift(back)}
  return {all,ys};
}
// 네모 칸 배치 (squarified treemap)
function squarify(items,x,y,w,h){
  const out=[];const total=items.reduce((a,b)=>a+b.v,0);
  if(!total||w<=0||h<=0)return out;
  let rest=items.filter(i=>i.v>0).map(i=>({...i,a:i.v/total*w*h}));
  const worst=(row,len)=>{const s=row.reduce((a,b)=>a+b.a,0);const mx=Math.max(...row.map(r=>r.a)),mn=Math.min(...row.map(r=>r.a));return Math.max(len*len*mx/(s*s),s*s/(len*len*mn))};
  while(rest.length){
    const len=Math.min(w,h);let row=[rest[0]];let i=1;
    while(i<rest.length&&worst([...row,rest[i]],len)<=worst(row,len)){row.push(rest[i]);i++}
    const s=row.reduce((a,b)=>a+b.a,0);
    if(w>=h){const cw=s/h;let cy=y;for(const r of row){const rh=r.a/cw;out.push({...r,x,y:cy,w:cw,h:rh});cy+=rh}x+=cw;w-=cw}
    else{const rh=s/w;let cx=x;for(const r of row){const cw=r.a/rh;out.push({...r,x:cx,y,w:cw,h:rh});cx+=cw}y+=rh;h-=rh}
    rest=rest.slice(i);
  }
  return out;
}
async function rmapSggData(sgg,years){
  const k=state.rmap.kind;
  const files=await Promise.all(years.map(y=>rmapGet(`./data/realty/dist/${k}/${sgg}/${y}.json`)));
  return years.map((y,i)=>({year:y,f:files[i]})).filter(x=>x.f);
}
// 고른 지역의 해별 ㎡당 가격 목록과, 다음 단계 칸 목록 (칸 크기 = 거래 건수)
// ---- 월 고르기 (2026-11-26): 고른 달을 고른 해마다 똑같이 적용 ----
const RMAP_ALL_MONTHS=[1,2,3,4,5,6,7,8,9,10,11,12];
const rmapMonthSet=()=>state.rmap.months||new Set(RMAP_ALL_MONTHS);
function rmapRecentMonths(){                         // 신고가 덜 끝난 최근 두 달 (이번 달·지난달)
  const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',month:'numeric'}).formatToParts(new Date());
  const m=+p.find(x=>x.type==='month').value;return new Set([m,m===1?12:m-1]);
}
// 시도·전국 칸용 분포 파일: 지역 → 월 → 로그 칸 건수
async function rmapHist(y,file){return rmapGet(`./data/realty/dist/${state.rmap.kind}/area/kids_${y}_${file}.json`)}
function rmapHistStat(h,w,months){                    // 고른 달을 합친 분포 → {n, md(㎡당 중위)}
  if(!h)return null;
  const cnt=new Map();let n=0;
  for(const m of months){const x=h[m];if(!x)continue;let b=0;for(let i=0;i<x.length;i+=2){b+=x[i];cnt.set(b,(cnt.get(b)||0)+x[i+1]);n+=x[i+1]}}
  if(!n)return {n:0,md:null};
  const bins=[...cnt.keys()].sort((a,b)=>a-b);let acc=0;const half=n/2;let md=null;
  for(const b of bins){acc+=cnt.get(b);if(acc>=half){md=Math.exp(b*w);break}}
  return {n,md};
}
// 고른 지역의 해별 ㎡당 가격 목록(오른쪽 곡선), 다음 단계 칸 목록(칸 크기 = 고른 해·달의 거래 건수), 칸별 통계(색·글자)
async function rmapNode(path,years){
  const r=state.rmap,idx=r.idx,months=rmapMonthSet();
  const counts=rmapCounts();
  const nm=c=>idx?.regions?.[c]||c;
  // 기준 (2026-11-26): 칸 크기·건수·가격 = 고른 해 중 마지막 해, 비교 = 한 해면 전년, 여러 해면 처음 고른 해 (같은 달)
  const Y=years.at(-1),P=rmapBaseYear(years);
  const st=new Map();
  if(path.length<2){
    const region=path.length?path[0]:'all';
    const file=path.length?path[0]:'all';
    const allYears=[...new Set([...years,P])];
    const [areas,hAll,hKid]=await Promise.all([
      Promise.all(years.map(y=>rmapGet(`./data/realty/dist/${r.kind}/area/${region}_${y}.json`))),
      Promise.all(allYears.map(y=>rmapHist(y,'all'))),
      Promise.all(allYears.map(y=>rmapHist(y,file)))]);
    const H=y=>hAll[allYears.indexOf(y)],K=y=>hKid[allYears.indexOf(y)];
    const series=years.map((y,i)=>{
      const a=areas[i],mo=a?.mo;
      const keep=(a?.s||[]).map((_,j)=>!mo||months.has(mo[j]));
      const vals=(a?.s||[]).filter((_,j)=>keep[j]);
      const refs=(a?.s||[]).map((_,j)=>a.G?[a.G[a.g[j]],a.x[j]]:null).filter((_,j)=>keep[j]);
      const hs=H(y)?rmapHistStat(H(y).r?.[region],H(y).w,months):null;
      return {year:y,vals,refs,n:hs?hs.n:(a?.n||0),md:hs?.md,sample:(hs?hs.n:(a?.n||0))>vals.length,noMonth:!mo&&months.size<12};
    });
    const keys=path.length?Object.keys(counts).filter(s=>s.slice(0,2)===path[0]):[...new Set(Object.keys(counts).map(c=>c.slice(0,2)))];
    const kids=keys.map(k=>{
      const tot=(y=>{const f=K(y);const x=f?rmapHistStat(f.r?.[k],f.w,months):null;return x?x.n:(path.length?rmapCount([k],[y]):rmapCount(Object.keys(counts).filter(s=>s.slice(0,2)===k),[y]))})(Y);
      const ce=K(Y)?.r?.[k],same=rmapMonthsWith(ce,months);           // 올해 자료가 있는 달만 전해와 비교 (올해는 아직 12월이 없다)
      const cur=K(Y)?rmapHistStat(ce,K(Y).w,months):null,prev=K(P)?rmapHistStat(K(P).r?.[k],K(P).w,same):null;
      st.set(k,rmapYoy(cur,prev));
      return {key:k,label:path.length?nm(k):(idx.sido?.[k]||k),n:tot};
    });
    return {series,kids,st};
  }
  const data=await rmapSggData(path[1],[...new Set([...years,P])]);
  const series=[],kidN=new Map(),cur=new Map(),prev=new Map();
  const kl=Math.min(path.length,rmapMaxDepth()-1);
  const fY=data.find(x=>x.year===Y)?.f,sameM=new Set((fY?.m||[]).filter(x=>months.has(x)));   // 올해 자료가 있는 달만 전해와 비교
  for(const {year,f} of data){
    const vals=[],refs=[],inSel=years.includes(year);
    for(let i=0;i<f.p.length;i++){
      if(!months.has(f.m?.[i]))continue;
      const c=f.c[f.k[i]],d=f.d[c[1]];
      if(kl>=3&&d!==path[2])continue;                  // 칸 단계: 2 = 법정동, 3 = 단지(고른 법정동 안)
      const key=kl===2?d:c[0];
      if(year===Y)(cur.get(key)||cur.set(key,[]).get(key)).push(f.p[i]);
      if(year===P&&sameM.has(f.m[i]))(prev.get(key)||prev.set(key,[]).get(key)).push(f.p[i]);
      if(year===Y)kidN.set(key,(kidN.get(key)||0)+1);  // 칸 크기 = 마지막 해 건수
      if(!inSel)continue;
      if(path.length>=3&&d!==path[2])continue;         // 오른쪽 곡선은 고른 지역만
      if(path.length>=4&&c[0]!==path[3])continue;
      vals.push(f.p[i]);refs.push([path[1],f.k[i]]);
    }
    if(inSel)series.push({year,vals,refs,n:vals.length,md:rmapMedian(vals),sample:false});
  }
  for(const k of kidN.keys()){const a=cur.get(k)||[],b=prev.get(k)||[];st.set(k,rmapYoy({n:a.length,md:rmapMedian(a)},{n:b.length,md:rmapMedian(b)}))}
  return {series,kids:[...kidN.entries()].map(([k,n])=>({key:k,label:k,n})),st};
}
// 칸 글자 모양 (정보가 많은 것부터). 지역명 · 건수 · 가격 변동 · ㎡당 중위가격, 단위를 붙여서 (2026-11-26 21시)
function rmapLayouts(t,st,ys){
  const cnt=`${t.n.toLocaleString('ko-KR')}건`,arr=st?.few?null:rmapArrow(st?.yoy),pct=st?.few?'표본 적음':pctText(st?.yoy);
  const lab=ys.length>1?`${ys[0]}년 대비 `:'전년 대비 ';
  const price=st?.md!=null?`㎡당 ${rmapNum(st.md)} 원`:'',pr2=st?.md!=null?`㎡당 ${rmapNum(st.md)}`:'';
  const nm={cls:'nm',text:t.label},big={cls:'big',text:cnt};
  const chg={cls:'ch',text:st?.few?pct:lab+pct,el:st?.few?[pct]:[lab,arr]};
  const short=()=>st?.few?[pct]:[rmapArrow(st?.yoy)];
  const chS={cls:'ch',text:pct,el:short()},mixA={cls:'mix',text:`${cnt} · ${pct}`,el:[`${cnt} · `,...short()]};
  const B=rmapBaseYear(ys),old=st?.pmd!=null&&!st?.few?`${B}년 ㎡당 ${rmapNum(st.pmd)} 원`:'';
  const tiny=n=>n>=1e4?(n/1e4).toFixed(1).replace(/\.0$/,'')+'만':n>=1e3?(n/1e3).toFixed(1).replace(/\.0$/,'')+'천':String(n);
  const L=[[nm,big,chg,{cls:'sub',text:price},{cls:'sub',text:old}],   // 다섯 줄: 큰 칸은 비교 해의 ㎡당 가격까지 (2026-11-26 23시)
    [nm,big,chg,{cls:'sub',text:price}],                 // 네 줄 (긴 글)
    [nm,big,chS,{cls:'sub',text:pr2}],                   // 네 줄 (짧은 글)
    [nm,mixA,{cls:'sub',text:pr2}],                      // 세 줄: 건수·변동을 한 줄로
    [nm,big,{cls:'mix',text:`${pct} · ${pr2}`,el:[...short(),` · ${pr2}`]}],
    [nm,big,chS],
    [nm,mixA],
    [nm,big],
    [{cls:'mix',text:`${t.label} ${cnt}`}],              // 아주 좁은 칸도 숫자 한 줄은 (이름·건수를 한 줄로)
    [{cls:'mix',text:`${tmShort(t.label)} ${cnt}`}],
    [nm,chS],
    [nm,{cls:'big',text:tiny(t.n)}],
    [{cls:'mix',text:`${tmShort(t.label)} ${tiny(t.n)}`}],
    [{cls:'big',text:tiny(t.n)}],
    [nm]];
  return L.map(l=>l.filter(x=>x.text&&x.text!=='㎡당 ')).filter(l=>l.length);
}
function rmapBaseYear(ys){return ys.length>1?ys[0]:String(+ys.at(-1)-1)}
const rmapCmpLabel=ys=>ys.length>1?`${ys[0]}→ `:'전년 ';
function rmapYoy(cur,prev){                           // 고른 해(가장 늦은 해)와 그 전해의 같은 달끼리 ㎡당 중위가격 비교
  const few=!(cur?.n>=RMAP_MIN_N&&prev?.n>=RMAP_MIN_N);
  return {n:cur?.n||0,md:cur?.md??null,pn:prev?.n||0,pmd:prev?.md??null,few,yoy:!few&&prev.md?(cur.md/prev.md-1)*100:null};
}
function rmapMonthsWith(h,months){const m=new Set();for(const x of months)if(h?.[x]?.length)m.add(x);return m}   // 그 해에 자료가 있는 달만 (같은 기간 비교)
function rmapQuant(sorted,q){if(!sorted.length)return null;const i=(sorted.length-1)*q,lo=Math.floor(i),hi=Math.min(lo+1,sorted.length-1);return sorted[lo]+(sorted[hi]-sorted[lo])*(i-lo)}
function rmapNice(hi,bins=45){const raw=Math.max(hi,1)/bins;for(const w of [1,2,5,10,20,25,50,100,200,250,500,1000])if(w>=raw)return w;return 2000}
function rmapShape(g,shape,x,y,r){
  g.beginPath();
  if(shape==='triangle'){g.moveTo(x,y-r*1.2);g.lineTo(x+r*1.1,y+r*0.8);g.lineTo(x-r*1.1,y+r*0.8);g.closePath();g.fill()}
  else if(shape==='square'){g.rect(x-r*0.9,y-r*0.9,r*1.8,r*1.8);g.fill()}
  else if(shape==='diamond'){g.moveTo(x,y-r*1.3);g.lineTo(x+r*1.1,y);g.lineTo(x,y+r*1.3);g.lineTo(x-r*1.1,y);g.closePath();g.fill()}
  else if(shape==='ring'){g.arc(x,y,r,0,6.283);g.lineWidth=1;g.strokeStyle=g.fillStyle;g.stroke()}
  else if(shape==='cross'){g.lineWidth=1.2;g.strokeStyle=g.fillStyle;g.moveTo(x-r,y-r);g.lineTo(x+r,y+r);g.moveTo(x+r,y-r);g.lineTo(x-r,y+r);g.stroke()}
  else{g.arc(x,y,r,0,6.283);g.fill()}
}
function rmapKindTabs(){
  const box=id('rmap-kinds');if(!box)return;box.replaceChildren();
  const r=state.rmap,have=r.idx?.kinds||{};
  const row=(list,cur,on)=>{const d=document.createElement('div');d.className='rmap-kind-row';
    for(const [k,label] of list){const b=document.createElement('button');b.type='button';b.textContent=label;b.className=k===cur?'on':'';b.addEventListener('click',()=>on(k));d.appendChild(b)}
    box.appendChild(d)};
  const go=()=>{r.kind=rmapKindOf(r.base,r.deal);r.path=[];r.long=null;id('rmap-long').hidden=true;renderTiles()};
  row(RMAP_BASES.map(x=>[x[0],x[1]]),r.base,k=>{if(k===r.base)return;r.base=k;if(k==='land')r.deal='trade';go()});
  if(r.base!=='land')row(RMAP_DEALS,r.deal,k=>{if(k===r.deal)return;r.deal=k;go()});   // 토지는 매매만
}
// ---- 네모 칸 색·글자 (2026-11-26): 색 = 고른 해(가장 늦은 해) 중위 거래가격의 전년 대비 변동률 ----
// 거래가격 = ㎡당 가격 × 면적 (분포 파일 값의 반올림 때문에 실제 금액과 조금 다를 수 있음). 단위 만원.
function rmapMedian(a){if(!a.length)return null;const v=[...a].sort((x,y)=>x-y),n=v.length;return n%2?v[(n-1)/2]:(v[n/2-1]+v[n/2])/2}
const RMAP_MIN_N=10;                                  // 비교하는 두 해 중 한쪽이라도 이보다 적으면 '표본 적음' (2026-11-26)
const RMAP_TONES=[['rc-up2','+3% 이상'],['rc-up1','+1~3%'],['rc-flat','-1~+1%'],['rc-dn1','-1~-3%'],['rc-dn2','-3% 이하'],['rc-few','표본 적음(10건 미만)']];
function rmapTone(p,few){return few?'rc-few':p==null?'rc-na':p>=3?'rc-up2':p>=1?'rc-up1':p>-1?'rc-flat':p>-3?'rc-dn1':'rc-dn2'}
function rmapNum(v){                              // 칸 안 가격: 단위 없이 숫자만 (만·억은 붙임). v 는 분포 값
  if(v==null)return '';const w=v*rmapUnitWon();
  return w>=1e8?`${(w/1e8).toFixed(w>=1e9?1:2)}억`:w>=1e5?`${Math.round(w/1e4).toLocaleString('ko-KR')}만`:w>=1e4?`${(w/1e4).toFixed(1)}만`:Math.round(w).toLocaleString('ko-KR');
}
function rmapPy(v){if(v==null)return '—';const p=v*3.3058;return p>=10000?`평당 ${(p/10000).toFixed(2)}억`:`평당 ${Math.round(p).toLocaleString('ko-KR')}만`}   // ㎡당(만원) → 평당
function rmapArrow(p,dg=1){                           // 외환 칸처럼 ▲ 빨강 · ▼ 파랑 · – 보합
  const s=document.createElement('b');
  if(p==null){s.textContent='–';s.className='flat';return s}
  const k=10**dg,r=Math.round(p*k)/k;
  s.className=r>0?'up':r<0?'down':'flat';
  s.textContent=`${r>0?'▲':r<0?'▼':'–'}${Math.abs(r).toFixed(dg)}%`;return s;
}
function pctText(p,dg=1){if(p==null)return '비교 자료 없음';const k=10**dg,r=Math.round(p*k)/k;return `${r>0?'▲':r<0?'▼':'–'}${Math.abs(r).toFixed(dg)}%`}
// 네모 칸 그리기 (부동산·인구 공통). 칸 크기에 따라 글자 단계: 3 큰 칸, 2 중간, 1 작은 칸, 0 아주 작은 칸(누르면 정보)
// 네모 칸 그리기 (부동산·인구·공급·재고 공통, 2026-11-26).
// 칸마다 4줄부터 시작해 글자를 15px→9px로 줄여 보고, 그래도 안 들어가면 아래 줄부터 뺀다. 숫자는 말줄임하지 않는다.
// 한 줄도 안 들어가면 이름에서 구·군·시를 떼어 보고, 그래도 안 되면 글자 없이 (누르면 정보).
// 누르면 바로 아래 단계로 들어간다. '기타 N곳' 칸은 묶인 지역 목록을 보인다.
const TM_MEASURE=document.createElement('canvas').getContext('2d');
function tmWidth(text,px,weight){TM_MEASURE.font=`${weight} ${px}px ${getComputedStyle(document.body).fontFamily}`;return TM_MEASURE.measureText(text).width}
// 줄 모양: [크기 배율, 굵기, 줄 높이, 넓은 화면 상한 px, 휴대전화 상한 px]. 상한이 있어 칸마다 글자 크기가 너무 달라지지 않는다
const TM_STYLE={nm:[1,700,1.2,15,13],big:[1.3,800,1.15,22,20],ch:[0.87,600,1.25,13,12],mix:[0.87,700,1.25,13,12],sub:[0.87,400,1.25,13,12]};
const TM_SIDO_SHORT={'전북특별자치도':'전북','강원특별자치도':'강원','제주특별자치도':'제주','세종특별자치시':'세종','전남광주통합특별시':'전남광주','충청북도':'충북','충청남도':'충남','경상북도':'경북','경상남도':'경남','전라북도':'전북','전라남도':'전남','경기도':'경기'};
function tmShort(name){name=String(name);return TM_SIDO_SHORT[name]||name.replace(/(특별자치시|특별자치도|특별시|광역시)$/,'').replace(/(.{2,})(구|군|시)$/,'$1')}
function tmPx(cls,fs,mob){const [k,,,c1,c2]=TM_STYLE[cls];return Math.max(9,Math.min(mob?c2:c1,fs*k))}
// 정보를 많이 넣는 것이 먼저 (2026-11-26): 줄이 가장 많은 모양부터, 그 모양이 들어가는 가장 큰 글자로
function tmFit(layouts,cw,ch,mob){
  const tight=cw<56||ch<34;                           // 아주 좁은 칸은 안쪽 여백을 2px 로 (tmCells 와 같게)
  const W=cw-(tight?5:12),H=ch-(tight?4:6);                                // 칸 안쪽 여백을 빼고
  for(let li=0;li<layouts.length;li++){
    const lines=layouts[li];
    for(let fs=16;fs>=7;fs--){                       // 7까지: 굵은 숫자도 9px까지 줄어들 수 있게 (다른 줄은 9px 아래로 안 내려감)
      let h=0,ok=true;
      for(const L of lines){const [,wt,lh]=TM_STYLE[L.cls];const px=tmPx(L.cls,fs,mob);h+=px*lh;if(tmWidth(L.text,px,wt)*1.06>W){ok=false;break}}
      if(ok&&h<=H)return {li,fs};
    }
  }
  return null;
}
function tmTapNote(){return window.matchMedia('(hover:none),(pointer:coarse)').matches?'칸을 한 번 누르면 정보, 한 번 더 누르면 아래 단계로 들어갑니다. 위에서 지역을 골라도 됩니다.':'칸을 누르거나 위에서 지역을 고르면 아래 단계로 들어갑니다. 칸에 마우스를 올리면 정보가 보입니다.'}
function tmCells(tree,shown,o){
  const W=tree.clientWidth||600,H=tree.clientHeight||480;
  const mob=window.matchMedia('(max-width:540px),(pointer:coarse)').matches;
  const touch=window.matchMedia('(hover:none),(pointer:coarse)').matches;
  const tip=document.createElement('div');tip.className='rmap-cell-tip';tip.hidden=true;
  let tipKey=null;
  for(const t of squarify(shown,0,0,W,H)){
    const b=document.createElement('button');b.type='button';
    const st=t.etc?null:o.stOf(t);
    b.className='rmap-cell '+(t.etc?'rc-etc':o.tone(st))+(o.isOn(t)?' on':'');
    const cw=Math.max(0,t.w-2),ch=Math.max(0,t.h-2);
    b.style.left=t.x+'px';b.style.top=t.y+'px';b.style.width=cw+'px';b.style.height=ch+'px';
    const etcN=t.etc?(o.etcText?o.etcText(t):t.n.toLocaleString('ko-KR')+(o.unit||'')):'';
    const base=t.etc?[[{cls:'nm',text:t.label},{cls:'big',text:etcN}],[{cls:'nm',text:t.label}]]:o.layouts(t,st);
    const sn=tmShort(t.label);                         // 이름이 길어 안 들어가면 구·군·시·특별자치도 등을 뗀 이름으로 같은 모양을 다시
    const lay=base.flatMap(l=>sn!==t.label?[l,l.map(L=>L.cls==='nm'?{cls:'nm',text:sn}:L)]:[l]);   // 모양마다 긴 이름 → 짧은 이름 순서
    if(cw<56||ch<34)b.style.padding='2px';
    const fit=tmFit(lay,cw,ch,mob);
    if(fit)for(const L of lay[fit.li]){
      const [,wt]=TM_STYLE[L.cls];const e=document.createElement('span');e.className=L.cls;e.style.fontSize=tmPx(L.cls,fit.fs,mob)+'px';e.style.fontWeight=wt;
      if(L.el)e.append(...L.el);else e.textContent=L.text;b.appendChild(e);
    }
    const lines2=t.etc?[t.label,etcN,...(t.names||[]).slice(0,8),(t.names||[]).length>8?'…':''].filter(Boolean):o.tipLines(t,st);
    b.title=lines2.join('\n');b.setAttribute('aria-label',lines2.join(', '));
    b.addEventListener('click',()=>{
      // 마우스: 누르면 바로 아래 단계로 (정보는 올려 두면 보임). 손가락(휴대전화): 첫 누름은 정보, 같은 칸을 한 번 더 누르면 아래 단계로 (2026-11-26 23시)
      if(!t.etc&&(!touch||tipKey===t.key)){o.go(t);return}
      tipKey=t.key;tip.replaceChildren(...lines2.map((l,i)=>{const e=document.createElement(i?'span':'strong');e.textContent=l;return e}));
      const hint=document.createElement('small');hint.textContent=t.etc?'작은 지역을 묶은 칸입니다':(o.hint||'한 번 더 누르면 들어갑니다');tip.append(hint);
      tip.hidden=false;
      tip.style.left=Math.min(Math.max(4,t.x),W-230)+'px';tip.style.top=(t.y+t.h+4>H-140?Math.max(4,t.y-144):t.y+t.h+4)+'px';
    });
    tree.appendChild(b);
  }
  tree.appendChild(tip);
  tree.onclick=e=>{if(!e.target.closest('.rmap-cell')){tip.hidden=true;tipKey=null}};
}
// 표시 개수를 넘는 지역은 '기타 N곳' 칸 하나로
function tmLimit(items,limit){
  if(items.length<=limit)return items;
  const keep=items.slice(0,limit-1),rest=items.slice(limit-1);
  return [...keep,{key:'__etc',label:`기타 ${rest.length}곳`,etc:true,n:rest.reduce((a,x)=>a+x.n,0),v:rest.reduce((a,x)=>a+x.v,0),names:rest.map(x=>`${x.label} ${x.n.toLocaleString('ko-KR')}`)}];
}
// 위치 줄 (2026-11-26): 처음부터 모든 단계를 보이고, 단계마다 펼침 목록으로 지역을 고른다. 안 고른 단계는 옅게.
// levels: [{name:'전국'}, {name:'시도', options: async()=>[[값, 이름], …]}, …], path: 고른 값들
function tmCrumbs(box,levels,path,go){
  box.replaceChildren();
  levels.forEach((L,i)=>{
    if(i){const sep=document.createElement('span');sep.className='sep';sep.textContent='›';box.appendChild(sep)}
    if(!i){const b=document.createElement('button');b.type='button';b.className='crumb'+(path.length?'':' cur');b.textContent=L.name;b.addEventListener('click',()=>go([]));box.appendChild(b);return}
    const chosen=path[i-1]!=null,open=i<=path.length+1;
    const wrap=document.createElement('span');wrap.className='crumb-sel'+(chosen?' chosen':'')+(open?'':' future')+(i===path.length?' cur':'');
    if(chosen){const b=document.createElement('button');b.type='button';b.className='crumb';b.textContent=L.label||path[i-1];b.title='이 단계로 돌아가기';b.addEventListener('click',()=>go(path.slice(0,i)));wrap.appendChild(b)}
    const sel=document.createElement('select');sel.disabled=!open;sel.setAttribute('aria-label',L.name+' 고르기');
    const ph=document.createElement('option');ph.value='';ph.textContent=chosen?'▾':L.name;sel.appendChild(ph);
    if(open)L.options().then(opts=>{for(const [v,t] of opts){const op=document.createElement('option');op.value=v;op.textContent=t;if(v===path[i-1])op.selected=false;sel.appendChild(op)}}).catch(()=>{});
    sel.addEventListener('change',()=>{if(sel.value)go([...path.slice(0,i-1),sel.value])});
    wrap.appendChild(sel);box.appendChild(wrap);
  });
}

function tmLegend(box,tones,note){
  box.replaceChildren();
  const sw=document.createElement('div');sw.className='rmap-legend-sw';
  for(const [c,l] of tones){const x=document.createElement('span');x.className='sw '+c;x.textContent=l;sw.appendChild(x)}
  const p=document.createElement('p');p.textContent=note;box.append(sw,p);
}
function rmapLine(cls,...parts){const d=document.createElement('span');d.className=cls;for(const x of parts)d.append(x);return d}
function rmapMonthText(){const m=rmapMonthSet();return m.size===12?'전체 달':[...m].sort((a,b)=>a-b).map(x=>x+'월').join('·')}
function rmapTipText(t,st,ys,path){
  const Y=ys.at(-1),B=rmapBaseYear(ys);
  const n=x=>x.toLocaleString('ko-KR'),r=state.rmap,won=rmapUnitWon();
  const unit=won===1?'원':'만원';
  const out=[`${t.label}`,`${Y}년 ${rmapMonthText()} ㎡당 중위 ${st?.md!=null?n(Math.round(st.md))+unit:'—'}${st?.md!=null&&won>1?` (평당 약 ${n(Math.round(st.md*3.3058))}만원)`:''}`,
    st?.few?`${B}년 같은 달 대비: 표본 적음 (${Y}년 ${n(st.n||0)}건 · ${B}년 ${n(st.pn||0)}건)`:`가격 ${B}년 같은 달 대비 ${pctText(st?.yoy)}`,`${Y}년 거래 ${n(st?.n||0)}건`];
  // 예전 '지역 통계'의 전세가율·전국 대비·10년 중 위치 (시도·시군구 칸, 신고가 마감된 달 기준)
  const type={apt:'apt',rh:'rh',land:'land'}[r.base],code=path&&path.length<2?t.key:null;
  const it=type&&code?state.realty?.items?.[type]?.[code]:null;
  if(it){
    if(typeof it.jeonse_ratio==='number')out.push(`전세가율 ${it.jeonse_ratio}% (㎡당 전세 ÷ 매매)`);
    if(typeof it.rel_ppm==='number')out.push(`전국 대비 ${Math.round(it.rel_ppm)} (전국 = 100)`);
    if(typeof it.rel_pct==='number')out.push(`10년 중 위치: ${it.rel_pct>=50?`상위 ${100-it.rel_pct}%`:`하위 ${it.rel_pct}%`}`);
    if(state.realty?.settled_month)out.push(`(위 세 값은 ${state.realty.settled_month} 기준)`);
  }
  return out;
}
function rmapLegend(ys){
  const box=id('rmap-legend');if(!box)return;
  const unit=rmapUnitWon()===1?'원':'만 원',Y=ys.at(-1),B=rmapBaseYear(ys);
  tmLegend(box,RMAP_TONES,`칸 크기: ${Y}년 거래 건수 · 색: ㎡당 중위가격, ${B}년 대비 ${Y}년 (${rmapMonthText()}, 같은 달끼리). ${ys.length>2?` 가운데 해(${ys.slice(1,-1).join('·')})는 오른쪽 분포 그래프에만 씁니다.`:''}`);
}
// ---- 공급·재고 (건축HUB): 자료가 모이기 전 안내 ----
async function renderHub(){
  const sup=state.cat==='hub:supply';
  const tree=id('hub-tree');
  tmCrumbs(id('hub-crumbs'),[{name:'전국'},{name:'시도',options:async()=>[['11','서울']]},{name:'시군구',options:async()=>[]},{name:'읍면동',options:async()=>[]}],[],()=>{});
  tree.textContent=`건축HUB ${sup?'주택인허가·건축인허가':'건축물대장'} 자료를 서울부터 받을 준비를 하고 있습니다. 자료가 차기 전에는 서울만 보입니다.`;
  tmLegend(id('hub-legend'),sup?RMAP_TONES.slice(0,5):[['rc-up2','30% 이상'],['rc-up1','20~30%'],['rc-flat','10~20%'],['rc-dn1','5~10%'],['rc-dn2','5% 미만']],
    sup?'칸 크기: 인허가 세대수 · 색: 전년 대비 증감. 단추로 인허가·착공·준공·순공급을 바꿔 봅니다.':'칸 크기: 주택 수 · 색: 30년 이상 노후 주택 비율.');
}
// ---- 인구 지도 (2026-11-26): 칸 크기 = 인구수, 색 = 1년 전 같은 달 대비 증감률 ----
const PMAP_CAT='pmap:pop';
const isPmap=c=>String(c).startsWith('pmap:');
state.pmap={path:[],idx:null};
const PMAP_TONES=[['rc-up2','+2% 이상'],['rc-up1','+0.5~2%'],['rc-flat','-0.5~+0.5%'],['rc-dn1','-0.5~-2%'],['rc-dn2','-2% 이하'],['rc-na','비교 자료 없음']];
function pmapTone(p){return p==null?'rc-na':p>=2?'rc-up2':p>=0.5?'rc-up1':p>-0.5?'rc-flat':p>-2?'rc-dn1':'rc-dn2'}
function popText(v,unit='명'){if(v==null)return '—';const t=v>=10000?`${(v/10000).toFixed(1)}만`:Math.round(v).toLocaleString('ko-KR');return unit?`${t} ${unit}`:t}
function pmapStat(row){                               // [이름, 인구, 세대, 전달 인구, 1년 전 인구, …]
  if(!row)return null;
  return {nm:row[0],p:row[1],h:row[2],yoy:row[4]?(row[1]/row[4]-1)*100:null,mom:row[3]?(row[1]/row[3]-1)*100:null};
}
function ymText(ym){return ym?`${ym.slice(0,4)}년 ${+ym.slice(4)}월`:''}
async function renderPmap(){
  const P=state.pmap,box=id('pmap-section');if(!box)return;
  const tree=id('pmap-tree');
  if(!P.idx){
    tree.textContent='자료를 불러오는 중…';
    P.idx=await rmapGet('./data/pop/tree/index.json');
    if(!P.idx){tree.textContent='인구 지도 자료(시군구·읍면동)는 관제기가 받는 중입니다.';id('pmap-crumbs').replaceChildren();renderStatus();return}
    renderStatus();
  }
  const idx=P.idx,path=P.path;
  let rows=[];
  if(!path.length)rows=Object.entries(idx.sido).map(([k,v])=>[k,v]);
  else if(path.length===1)rows=Object.entries(idx.sgg).filter(([k,v])=>v[5]===path[0]);
  else{
    const f=await rmapGet(`./data/pop/tree/${path[0]}.json`);
    if(P.path!==path)return;
    rows=Object.entries(f?.dong||{}).filter(([k,v])=>v[5]===path[1]);
  }
  const names=['전국',idx.sido?.[path[0]]?.[0],idx.sgg?.[path[1]]?.[0],null];
  if(path[2]){const f=await rmapGet(`./data/pop/tree/${path[0]}.json`);names[3]=f?.dong?.[path[2]]?.[0]}
  const byName=o=>Object.entries(o).sort((a,b)=>a[1][0].localeCompare(b[1][0],'ko')).map(([k,v])=>[k,v[0]]);
  tmCrumbs(id('pmap-crumbs'),[{name:'전국'},
    {name:'시도',label:names[1],options:async()=>byName(idx.sido)},
    {name:'시군구',label:names[2],options:async()=>byName(Object.fromEntries(Object.entries(idx.sgg).filter(([k,v])=>v[5]===path[0])))},
    {name:'읍면동',label:names[3],options:async()=>{const f=await rmapGet(`./data/pop/tree/${path[0]}.json`);return byName(Object.fromEntries(Object.entries(f?.dong||{}).filter(([k,v])=>v[5]===path[1])))}}],
    path,np=>{P.path=np;renderPmap()});
  const here=!path.length?pmapStat(idx.nat):path.length===1?pmapStat(idx.sido[path[0]]):pmapStat(idx.sgg[path[1]]);
  id('pmap-note').textContent=`${ymText(idx.month)} 기준${here?` · ${names[Math.min(path.length,2)]} 인구 ${popText(here.p)} · 1년 전보다 ${pctText(here.yoy,2)}`:''}`;
  const leaf=path.length>=2;
  const items=rows.map(([k,v])=>({key:k,label:v[0],n:v[1]||0,v:v[1]||0,row:v})).filter(x=>x.v>0).sort((a,b)=>b.v-a.v);
  tree.replaceChildren();
  tmCells(tree,tmLimit(items,leaf?120:300),{
    stOf:t=>pmapStat(t.row),tone:st=>pmapTone(st?.yoy),isOn:t=>leaf&&t.key===path[2],
    unit:'명',
    layouts:(t,st)=>{                                 // 지역명 · 인구 · 전년 대비 · 세대수 (정보가 많은 것부터)
      const nm={cls:'nm',text:t.label},pp=popText(st?.p),pct=pctText(st?.yoy,2),hh=`세대 ${popText(st?.h,'')}`;
      const big={cls:'big',text:pp},chg={cls:'ch',text:'전년 대비 '+pct,el:['전년 대비 ',rmapArrow(st?.yoy,2)]};
      const chS={cls:'ch',text:pct,el:[rmapArrow(st?.yoy,2)]};
      return [[nm,big,chg,{cls:'sub',text:hh}],[nm,big,chS,{cls:'sub',text:hh}],
        [nm,{cls:'mix',text:`${pp} · ${pct}`,el:[`${pp} · `,rmapArrow(st?.yoy,2)]},{cls:'sub',text:hh}],
        [nm,big,{cls:'mix',text:`${pct} · ${hh}`,el:[rmapArrow(st?.yoy,2),` · ${hh}`]}],
        [nm,big,chg],[nm,{cls:'mix',text:`${pp} · ${pct}`,el:[`${pp} · `,rmapArrow(st?.yoy,2)]}],[nm,big],
        [{cls:'mix',text:`${t.label} ${pp}`}],[{cls:'mix',text:`${tmShort(t.label)} ${pp}`}],   // 아주 좁은 칸도 숫자 한 줄은
        [nm,{cls:'ch',text:pct,el:[rmapArrow(st?.yoy,2)]}],[{cls:'big',text:popText(st?.p,'')}],[nm]];
    },
    tipLines:(t,st)=>[t.label,`인구 ${popText(st?.p)} (${ymText(idx.month)})`,`전년 같은 달 대비 ${pctText(st?.yoy,2)}`,`전달 대비 ${pctText(st?.mom,2)}`,`세대 ${popText(st?.h,'세대')}`],
    hint:leaf?'읍면동이 마지막 단계입니다':undefined,
    go:t=>{P.path=leaf?[path[0],path[1],t.key]:[...path,t.key];renderPmap()}});
  if(!items.length)tree.textContent='자료가 없습니다.';
  tmLegend(id('pmap-legend'),PMAP_TONES,`칸 크기: 인구수 · 색: 전년 같은 달 대비 인구 증감률 (${ymText(idx.month)} ↔ ${ymText(idx.yago)}). 읍면동은 행정동 기준이고, 그사이 이름·경계가 바뀐 곳은 비교하지 않습니다.`);
  id('pmap-note2').textContent=tmTapNote();
}
async function renderRmap(){
  const r=state.rmap;
  const box=id('rmap-section');if(!box)return;
  if(!r.idx){
    id('rmap-tree').textContent='자료를 불러오는 중…';
    r.idx=await rmapGet('./data/realty/dist/index.json');
    if(!r.idx){id('rmap-tree').textContent='가격 분포 자료가 아직 없습니다. 관제기가 만드는 중입니다.';return}
    rmapKindTabs();
  }
  if(!r.idx.kinds?.[r.kind]||!Object.keys(r.idx.counts?.[r.kind]||{}).length){   // 단추는 모두 켜 두고, 자료가 없으면 안내만
    id('rmap-tree').textContent=`${rmapKindLabel()} 자료는 관제기가 수집 중입니다. 모이는 대로 이 화면에 나타납니다.`;
    id('rmap-crumbs').replaceChildren();id('rmap-legend').replaceChildren();id('rmap-chart').getContext('2d').clearRect(0,0,9999,9999);id('rmap-stats').replaceChildren();return}
  const path=r.path;
  const {all,ys}=rmapSel(path);
  r.years=new Set(ys);
  const node=await rmapNode(path,ys);
  if(r.path!==path)return;                          // 그사이 다른 칸을 눌렀다
  // 위치 줄: 전국 › 시도 › 시군구 › 법정동 › 단지 (단독·다가구는 법정동까지). 단계마다 펼침 목록
  const counts=rmapCounts(),maxD=rmapMaxDepth();
  const sggData=async()=>path[1]?rmapSggData(path[1],ys):[];
  const levels=[{name:'전국'},
    {name:'시도',label:r.idx.sido?.[path[0]],options:async()=>[...new Set(Object.keys(counts).map(c=>c.slice(0,2)))].sort().map(c=>[c,r.idx.sido?.[c]||c])},
    {name:'시군구',label:r.idx.regions?.[path[1]],options:async()=>Object.keys(counts).filter(c=>c.slice(0,2)===path[0]).sort().map(c=>[c,r.idx.regions?.[c]||c])},
    {name:'법정동',label:path[2],options:async()=>{const ds=new Set();for(const {f} of await sggData())for(const d of f.d)ds.add(d);return [...ds].sort().map(d=>[d,d])}}];
  if(maxD>=4)levels.push({name:rmapLeafLabel(),label:path[3],options:async()=>{const cs=new Set();for(const {f} of await sggData())for(const c of f.c)if(f.d[c[1]]===path[2])cs.add(c[0]);return [...cs].sort().map(c=>[c,c])}});
  tmCrumbs(id('rmap-crumbs'),levels,path,np=>{r.path=np;renderRmap()});
  // 네모 칸: 크기는 거래 건수, 색은 ㎡당 중위가격 전년 같은 기간 대비, 글자는 칸 크기에 맞춰 (2026-11-26)
  const ks=node.st;
  const Y=ys.at(-1);
  const tree=id('rmap-tree');tree.replaceChildren();
  const leaf=path.length>=maxD;
  const items=node.kids.map(k=>({...k,v:k.n})).filter(k=>k.v>0).sort((a,b)=>b.v-a.v);
  const shown=tmLimit(items,leaf||path.length>=3?80:400);
  tmCells(tree,shown,{
    stOf:t=>ks.get(t.key),tone:st=>rmapTone(st?.yoy,st?.few),isOn:t=>leaf&&t.key===path[maxD-1],
    unit:'건',
    layouts:(t,st)=>rmapLayouts(t,st,ys),
    tipLines:(t,st)=>rmapTipText(t,st,ys,path),
    hint:leaf?'마지막 단계입니다':undefined,
    go:t=>{r.path=leaf?[...path.slice(0,maxD-1),t.key]:[...path,t.key];renderRmap()}});
  rmapLegend(ys);
  if(!items.length)tree.textContent='고른 연도·달에 거래가 없습니다.';
  const sidoN=new Set(Object.keys(counts).map(c=>c.slice(0,2))).size;
  id('rmap-size-note').textContent='';
  id('rmap-note').textContent=`${tmTapNote()}${!path.length&&sidoN<16?` 수집된 시도만 표시 (${sidoN}곳).`:''}${items.length>shown.length?` 작은 ${items.length-shown.length+1}곳은 '기타' 칸 하나로 묶었습니다.`:''}`;
  // 연도 범례
  const yb=id('rmap-years');yb.replaceChildren();
  all.forEach(y=>{
    const b=document.createElement('button');b.type='button';
    const k=ys.indexOf(y);
    b.className='rmap-year'+(k>=0?' on':'');
    if(k>=0){b.style.setProperty('--c',RMAP_COLORS[k%RMAP_COLORS.length]);b.textContent=`${'●▲■◆○✕'[k%6]} ${y}`}else b.textContent=y;
    b.addEventListener('click',()=>{
      const set=new Set(r.years||[]);
      if(set.has(y)){if(set.size>1)set.delete(y)}else{if(set.size>=6)set.delete([...set].sort()[0]);set.add(y)}
      r.years=set;renderRmap();
    });
    yb.appendChild(b);
  });
  // 월 단추 (여러 개 고르기, 고른 해마다 같은 달). 최근 두 달은 신고가 덜 끝나 흐리게
  const mb=id('rmap-months');
  if(mb){
    mb.replaceChildren();const ms=rmapMonthSet(),recent=rmapRecentMonths();
    const all=document.createElement('button');all.type='button';all.textContent='전체';all.className='rmap-month'+(ms.size===12?' on':'');
    all.addEventListener('click',()=>{r.months=null;renderRmap()});mb.appendChild(all);
    for(const m of RMAP_ALL_MONTHS){
      const b=document.createElement('button');b.type='button';b.textContent=m+'월';
      b.className='rmap-month'+(ms.size<12&&ms.has(m)?' on':'')+(recent.has(m)?' recent':'');
      if(recent.has(m))b.title='최근 두 달: 신고가 덜 끝나 건수가 적습니다';
      b.addEventListener('click',()=>{
        let set=r.months?new Set(r.months):new Set();
        if(!r.months)set=new Set([m]);                  // 전체 상태에서 누르면 그 달만
        else if(set.has(m)){set.delete(m);if(!set.size)set=null}else set.add(m);
        r.months=set&&set.size<12?set:null;renderRmap();
      });
      mb.appendChild(b);
    }
  }
  r.view={series:node.series,ys};
  drawRmap();
  if(path.length>=4)rmapOpenLong(path[1],path[2],path[3]);
}
function drawRmap(){
  const r=state.rmap,v=r.view;if(!v)return;
  const cv=id('rmap-chart'),wrap=cv.parentElement;
  const dpr=Math.min(window.devicePixelRatio||1,2);
  const W=wrap.clientWidth,H=wrap.clientHeight;
  cv.width=W*dpr;cv.height=H*dpr;cv.style.width=W+'px';cv.style.height=H+'px';
  const g=cv.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,W,H);
  const pad={l:44,r:12,t:12,b:34};const pw=W-pad.l-pad.r,ph=H-pad.t-pad.b;
  const series=v.series.filter(s=>s.vals.length);
  const stats=id('rmap-stats');stats.replaceChildren();
  r.dots=[];
  if(!series.length){g.fillStyle='#667';g.font='13px sans-serif';g.fillText('고른 연도·달에 거래가 없습니다.',pad.l,pad.t+20);return}
  const allv=series.flatMap(s=>s.vals).sort((a,b)=>a-b);
  const lo=Math.max(0,rmapQuant(allv,0.005)),hi=rmapQuant(allv,0.995);
  const w=rmapNice(hi-lo,Math.max(10,Math.min(45,Math.round(Math.sqrt(allv.length/series.length)*1.3)))),x0=Math.floor(lo/w)*w,nb=Math.max(1,Math.ceil((hi-x0)/w)+1);
  const X=val=>pad.l+(val-x0)/(nb*w)*pw;
  const colorOf=s=>RMAP_COLORS[v.ys.indexOf(s.year)%RMAP_COLORS.length];
  const shapeOf=s=>RMAP_SHAPES[v.ys.indexOf(s.year)%RMAP_SHAPES.length];
  const curves=series.map(s=>{
    const b=new Array(nb).fill(0);for(const val of s.vals){const i=Math.floor((val-x0)/w);if(i>=0&&i<nb)b[i]++}
    const n=s.vals.length;const share=b.map(c=>c/n*100);
    const sm=share.map((_,i)=>{let a=0,t=0;for(let j=-2;j<=2;j++){const k=i+j;if(k<0||k>=nb)continue;const wt=[1,4,6,4,1][j+2];a+=share[k]*wt;t+=wt}return a/t});
    return {s,sm};
  });
  const ymax=Math.max(...curves.flatMap(c=>c.sm))*1.1||1;
  const Y=val=>pad.t+ph-val/ymax*ph;
  const at=(sm,val)=>{const f=(val-x0)/w-0.5;const i=Math.floor(f),t=f-i;const a=sm[Math.max(0,Math.min(nb-1,i))],b=sm[Math.max(0,Math.min(nb-1,i+1))];return a+(b-a)*t};
  g.strokeStyle='#e3e7ee';g.fillStyle='#667085';g.font='11px sans-serif';g.lineWidth=1;
  const tstep=[1,2,5,10,20,25,50,100,200,250,500,1000,2000,5000].find(t=>nb*w/t<=7)||10000;
  for(let t=Math.ceil(x0/tstep)*tstep;t<=x0+nb*w;t+=tstep){const x=X(t);g.beginPath();g.moveTo(x,pad.t);g.lineTo(x,pad.t+ph);g.stroke();g.textAlign='center';g.fillText(t.toLocaleString('ko-KR'),x,pad.t+ph+14)}
  const ystep=[0.1,0.2,0.5,1,2,5,10,20,25,50].find(t=>ymax/t<=5)||100;
  g.textAlign='right';for(let val=0;val<=ymax+1e-9;val+=ystep){const y=Y(val);g.beginPath();g.moveTo(pad.l,y);g.lineTo(pad.l+pw,y);g.stroke();g.fillText((ystep<1?val.toFixed(1):Math.round(val))+'%',pad.l-4,y+4)}
  g.textAlign='center';g.fillText('㎡당 가격 (만원)',pad.l+pw/2,H-4);
  // 점: 거래 하나 = 점 하나, 곡선 아래 무작위 높이. 연도마다 색과 모양이 다르다.
  curves.forEach((c,ci)=>{
    g.fillStyle=colorOf(c.s);g.globalAlpha=c.s.vals.length>3000?0.25:0.45;
    let seed=7+ci*1009;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
    const rad=c.s.vals.length>3000?1.3:1.9;const shape=shapeOf(c.s);
    c.s.vals.forEach((val,j)=>{const ry=rnd();if(val<x0||val>x0+nb*w)return;const x=X(val),y=Y(at(c.sm,val)*ry*0.96);rmapShape(g,shape,x,y,rad);
      if(c.s.refs?.[j])r.dots.push({x,y,year:c.s.year,ref:c.s.refs[j]})});
    g.globalAlpha=1;
  });
  curves.forEach(c=>{
    g.strokeStyle=colorOf(c.s);g.lineWidth=2.2;g.beginPath();
    c.sm.forEach((val,i)=>{const x=X(x0+(i+0.5)*w),y=Y(val);i?g.lineTo(x,y):g.moveTo(x,y)});g.stroke();
  });
  if(r.hoverX!=null){
    const val=x0+(r.hoverX-pad.l)/pw*nb*w;
    if(val>=x0&&val<=x0+nb*w){
      const x=X(val);g.strokeStyle='#111827';g.setLineDash([3,3]);g.beginPath();g.moveTo(x,pad.t);g.lineTo(x,pad.t+ph);g.stroke();g.setLineDash([]);
      const tip=id('rmap-tip');tip.hidden=false;
      tip.innerHTML=`<strong>㎡당 ${Math.round(val).toLocaleString('ko-KR')}만원</strong> (평당 약 ${Math.round(val*3.3058).toLocaleString('ko-KR')}만원)<br>`+
        curves.map(c=>`<span style="color:${colorOf(c.s)}">${c.s.year}년</span> 이 가격대(폭 ${w}만원) 비중 ${at(c.sm,val).toFixed(1)}%`).join('<br>');
      tip.style.left=Math.min(Math.max(0,x+10),W-230)+'px';tip.style.top='8px';
    }
  }else id('rmap-tip').hidden=true;
  for(const c of curves){
    const s=c.s;const sv=[...s.vals].sort((a,b)=>a-b);
    const q=[0.25,0.5,0.75].map(p=>Math.round(rmapQuant(sv,p)));
    const md=Math.round(s.md??q[1]),n=s.n||s.vals.length;
    const d=document.createElement('div');d.className='rmap-stat';
    d.style.setProperty('--c',colorOf(s));
    d.innerHTML=`<b>${'●▲■◆○✕'[v.ys.indexOf(s.year)%6]} ${s.year}년</b> 거래 ${n.toLocaleString('ko-KR')}건${n<10?' <em class="few">표본 적음</em>':''} · 중위 ㎡당 ${md.toLocaleString('ko-KR')}만원(${rmapPy(md)}) · 가운데 절반 ${q[0].toLocaleString('ko-KR')}~${q[2].toLocaleString('ko-KR')}만원${s.sample?` · 점은 표본 ${s.vals.length.toLocaleString('ko-KR')}건`:''}${s.noMonth?' · 이 지역 점에는 아직 달 정보가 없어 전체 달':''}`;
    stats.appendChild(d);
  }
}
// ---- 단지(건물·지목) 장기 추이: 환율 그래프처럼 장기(아래 날짜)와 최근 구간(위 날짜), 회색 띠 ----
async function rmapOpenLong(sgg,dong,name){
  const r=state.rmap;
  const counts=rmapCounts()[sgg]||{};
  const years=Object.keys(counts).filter(y=>counts[y]).sort();
  const files=await Promise.all(years.map(y=>rmapGet(`./data/realty/dist/${r.kind}/${sgg}/${y}.json`)));
  const pts=[];
  files.forEach((f,i)=>{
    if(!f||!f.a)return;
    const y=+years[i];
    for(let j=0;j<f.p.length;j++){
      const c=f.c[f.k[j]];
      if(c[0]!==name||f.d[c[1]]!==dong)continue;
      const dd=f.dd?.[j]||0;                          // 계약일·층·거래 유형·동 (관제기 0.6.4부터, 없으면 빈 값)
      pts.push({t:y+(f.m[j]-1+(dd?Math.min(dd,28)/30:0.5))/12,ym:`${y}.${String(f.m[j]).padStart(2,'0')}`,dd,fl:f.fl?.[j]??null,gb:f.gb?.[j]||0,dn:f.dn?.[j]||'',ppm:f.p[j],area:f.a[j]});
    }
  });
  pts.sort((a,b)=>a.t-b.t);
  r.long={sgg,dong,name,pts};r.longHide=new Set();
  if(r.kind==='land')r.longMode='ppm';
  document.querySelectorAll('#rmap-long-mode button').forEach(x=>x.classList.toggle('on',x.dataset.mode===r.longMode));
  id('rmap-long').hidden=false;
  drawRmapLong();
  id('rmap-long').scrollIntoView({behavior:'smooth',block:'nearest'});
}
async function rmapOpenFromDot(d){
  const [sgg,k]=d.ref;
  const f=await rmapGet(`./data/realty/dist/${state.rmap.kind}/${sgg}/${d.year}.json`);
  const c=f?.c?.[k];if(!c)return;
  const sido=sgg.slice(0,2),dong=f.d[c[1]];
  state.rmap.path=[sido,sgg,dong,c[0]];                  // 왼쪽 칸도 그 단지로 내려간다
  renderRmap();
}
function drawRmapLong(){
  const r=state.rmap,L=r.long;if(!L)return;
  const cv=id('rmap-long-chart'),wrap=cv.parentElement;
  const dpr=Math.min(window.devicePixelRatio||1,2);
  const W=wrap.clientWidth,H=wrap.clientHeight;
  cv.width=W*dpr;cv.height=H*dpr;cv.style.width=W+'px';cv.style.height=H+'px';
  const g=cv.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,W,H);
  const land=r.kind==='land';
  const price=r.longMode==='price';
  const val=p=>price?p.ppm*p.area/10000:p.ppm;                       // 거래가·보증금은 억 원(만원/㎡×㎡÷1만), 월세는 만 원(원/㎡×㎡÷1만). ㎡당은 그대로
  const gkey=p=>land?0:p.area;                                        // 토지는 면적별로 나누지 않는다
  const sgName=`${r.idx?.sido?.[L.sgg.slice(0,2)]||''} ${r.idx?.regions?.[L.sgg]||''}`.trim();
  id('rmap-long-title').textContent=`${L.name} · ${sgName} ${L.dong}`;
  id('rmap-long-note').textContent=L.pts.length?`거래 ${L.pts.length.toLocaleString('ko-KR')}건 · ${L.pts[0].ym}~${L.pts.at(-1).ym}`:'거래가 없습니다.';
  const by=new Map();for(const p of L.pts)by.set(gkey(p),(by.get(gkey(p))||0)+1);
  const groups=[...by.entries()].sort((a,b)=>b[1]-a[1]);
  const colorOf=new Map();groups.slice(0,6).forEach(([a],i)=>colorOf.set(a,land?'#1f3b63':RMAP_COLORS[i]));
  const lg=id('rmap-long-legend');lg.replaceChildren();
  if(!land)for(const [a,n] of [...groups].sort((x,y)=>x[0]-y[0])){
    const b=document.createElement('button');b.type='button';
    const col=colorOf.get(a)||'#98a2b3';const off=r.longHide.has(a);
    b.className='rmap-year'+(off?'':' on');b.style.setProperty('--c',col);
    b.textContent=`전용 ${a}㎡ · ${n}건`;
    b.addEventListener('click',()=>{off?r.longHide.delete(a):r.longHide.add(a);drawRmapLong()});
    lg.appendChild(b);
  }
  const pts=L.pts.filter(p=>!r.longHide.has(gkey(p)));
  r.longScale=null;
  if(!pts.length)return;
  const pad={l:52,r:14,t:10,b:28};const pw=W-pad.l-pad.r,ph=H-pad.t-pad.b;
  // 가로축 하나 (2026-11-26): 그 단지 거래 전체 기간. 실선 = 면적별 월 중위값, 점 = 거래 하나 (실제 날짜 위치에 옅게)
  const t0=Math.floor(pts[0].t),t1=Math.ceil(pts.at(-1).t+0.001);
  const vs=pts.map(val);let v0=Math.min(...vs),v1=Math.max(...vs);const pd=(v1-v0||v1||1)*0.08;v0=Math.max(0,v0-pd);v1+=pd;
  const X=t=>pad.l+(t-t0)/(t1-t0)*pw,Y=v=>pad.t+ph-(v-v0)/(v1-v0)*ph;
  // 위 분포 그래프에서 고른 해: 옅은 배경
  g.fillStyle='rgba(31,111,235,.07)';
  for(const y of r.years||[]){const a=+y;if(a+1<=t0||a>=t1)continue;g.fillRect(X(Math.max(a,t0)),pad.t,X(Math.min(a+1,t1))-X(Math.max(a,t0)),ph)}
  g.strokeStyle='#e3e7ee';g.fillStyle='#475467';g.font='11px sans-serif';g.lineWidth=1;
  const ystep=Math.max(1,Math.ceil((t1-t0)/10));
  for(let y=t0;y<=t1;y+=ystep){const x=X(y);g.beginPath();g.moveTo(x,pad.t);g.lineTo(x,pad.t+ph);g.stroke();g.textAlign='center';g.fillText(String(y),x,pad.t+ph+14)}
  const wolse=r.deal==='wolse'&&!land;
  const raw=(v1-v0)/5;const mag=10**Math.floor(Math.log10(raw||1));const st=[1,2,2.5,5,10].map(k=>k*mag).find(k=>k>=raw)||mag*10;
  const yl=v=>price?(wolse?Math.round(v).toLocaleString('ko-KR')+'만':(v>=10?Math.round(v):v.toFixed(1))+'억'):Math.round(v).toLocaleString('ko-KR');
  g.fillStyle='#667085';g.textAlign='right';for(let v=Math.ceil(v0/st)*st;v<=v1;v+=st){const y=Y(v);g.strokeStyle='#e3e7ee';g.beginPath();g.moveTo(pad.l,y);g.lineTo(pad.l+pw,y);g.stroke();g.fillText(yl(v),pad.l-4,y+4)}
  // 면적별 월 중위값: 거래가 3개월 넘게 없으면 선을 끊는다
  const monthly=(list,a)=>{const m=new Map();for(const p of list)if(gkey(p)===a)(m.get(p.ym)||m.set(p.ym,[]).get(p.ym)).push(p);return [...m.values()].map(ps=>{const v=ps.map(val).sort((x,y)=>x-y);return [ps[0].t,v[Math.floor((v.length-1)/2)]]}).sort((x,y)=>x[0]-y[0])};
  const line=(rows,col)=>{g.strokeStyle=col;g.lineWidth=1.8;g.beginPath();rows.forEach(([t,v],i)=>{const x=X(t),y=Y(v);if(!i||t-rows[i-1][0]>3.01/12)g.moveTo(x,y);else g.lineTo(x,y)});g.stroke()};
  for(const p of pts){g.fillStyle=colorOf.get(gkey(p))||'#98a2b3';g.globalAlpha=0.28;g.beginPath();g.arc(X(p.t),Y(val(p)),2.3,0,6.283);g.fill()}
  g.globalAlpha=1;
  for(const [a,col] of colorOf){if(r.longHide.has(a))continue;line(monthly(pts,a),col)}
  r.longScale={XS:X,Y,val,pts};
  const tip=id('rmap-long-tip');
  if(r.longHover&&pts.includes(r.longHover)){
    const p=r.longHover;tip.hidden=false;
    const won=rmapUnitWon(),amt=p.ppm*p.area*won;
    const what=land||r.deal==='trade'?'거래가':r.deal==='jeonse'?'전세 보증금':'월세';
    const date=p.dd?`${p.ym}.${String(p.dd).padStart(2,'0')}`:p.ym;
    const extra=[p.fl!=null&&!land?`${p.fl}층`:'',p.gb===1?'중개거래':p.gb===2?'직거래':''].filter(Boolean).join(' · ');
    tip.innerHTML=`<strong>${date}</strong>${land?'':` 전용 ${p.area}㎡`}${p.dn?` (${/동$/.test(p.dn)?p.dn:p.dn+'동'})`:''}${extra?`<br>${extra}`:''}<br>${what} ${amt>=1e8?(amt/1e8).toFixed(2)+'억':Math.round(amt/1e4).toLocaleString('ko-KR')+'만'} 원 · ㎡당 ${p.ppm.toLocaleString('ko-KR')}${won===1?'':'만'} 원`;
    tip.style.left=Math.min(Math.max(0,X(p.t)+10),W-220)+'px';tip.style.top='8px';
    g.strokeStyle='#111827';g.lineWidth=1.5;g.beginPath();g.arc(X(p.t),Y(val(p)),5,0,6.283);g.stroke();
  }else tip.hidden=true;
}
id('rmap-chart').addEventListener('pointermove',e=>{const rc=e.currentTarget.getBoundingClientRect();state.rmap.hoverX=e.clientX-rc.left;drawRmap()});
id('rmap-chart').addEventListener('pointerleave',()=>{state.rmap.hoverX=null;drawRmap()});
id('rmap-chart').addEventListener('click',e=>{
  const rc=e.currentTarget.getBoundingClientRect(),x=e.clientX-rc.left,y=e.clientY-rc.top;
  let best=null,bd=144;for(const d of state.rmap.dots){const dd=(d.x-x)**2+(d.y-y)**2;if(dd<bd){bd=dd;best=d}}
  if(best)rmapOpenFromDot(best);
});
id('rmap-long-chart').addEventListener('pointermove',e=>{
  const s=state.rmap.longScale;if(!s)return;const rc=e.currentTarget.getBoundingClientRect(),x=e.clientX-rc.left,y=e.clientY-rc.top;
  let best=null,bd=400;for(const p of s.pts){const dd=(s.XS(p.t)-x)**2+(s.Y(s.val(p))-y)**2;if(dd<bd){bd=dd;best=p}}
  if(best!==state.rmap.longHover){state.rmap.longHover=best;drawRmapLong()}
});
id('rmap-long-chart').addEventListener('pointerleave',e=>{if(e.pointerType==='mouse'){state.rmap.longHover=null;drawRmapLong()}});
id('rmap-long-chart').addEventListener('click',e=>{              // 휴대전화: 점을 누르면 정보 (2026-11-26)
  const s=state.rmap.longScale;if(!s)return;const rc=e.currentTarget.getBoundingClientRect(),x=e.clientX-rc.left,y=e.clientY-rc.top;
  let best=null,bd=900;for(const p of s.pts){const dd=(s.XS(p.t)-x)**2+(s.Y(s.val(p))-y)**2;if(dd<bd){bd=dd;best=p}}
  state.rmap.longHover=best;drawRmapLong();
});
document.querySelectorAll('#rmap-long-mode button').forEach(b=>b.addEventListener('click',()=>{
  state.rmap.longMode=b.dataset.mode;document.querySelectorAll('#rmap-long-mode button').forEach(x=>x.classList.toggle('on',x===b));drawRmapLong();
}));
let rmapResize=null;
window.addEventListener('resize',()=>{if(isPmap(state.cat)){clearTimeout(rmapResize);rmapResize=setTimeout(renderPmap,200);return}if(!isRmap(state.cat))return;clearTimeout(rmapResize);rmapResize=setTimeout(()=>{renderRmap();drawRmapLong()},200)});

// ---- 검색 칸 (2026-11-26): 지표·환율·ETF·주식·부동산 지역·단지·인구 지역·예금 기관 ----
// 이름 목록: 지표·환율은 이미 받은 요약 파일에서, 나머지는 관제기가 게시 때 만드는 data/search/index.json·places.json (검색 칸을 처음 누를 때 받음)
const SEARCH={idx:null,places:null,loading:null,entries:null,built:0};
const CHO='ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
function choOf(t){let o='';for(const ch of String(t)){const c=ch.charCodeAt(0);o+=c>=0xAC00&&c<=0xD7A3?CHO[Math.floor((c-0xAC00)/588)]:ch}return o}
const normS=t=>String(t||'').toLowerCase().replace(/\s+/g,'');
// 영문 별칭 → 한글 검색어
const SEARCH_ALIAS={kospi:'코스피',kosdaq:'코스닥',krx:'KRX',fed:'연방기금',fomc:'연방기금',ffr:'연방기금',sp500:'S&P',spx:'S&P',nasdaq:'나스닥',dow:'다우',
  nikkei:'니케이',gold:'금',silver:'은',oil:'유가',wti:'WTI',brent:'브렌트',cpi:'소비자물가',ppi:'생산자물가',gdp:'GDP',m2:'M2',bitcoin:'비트코인',btc:'비트코인',eth:'이더리움',
  usd:'달러',dollar:'달러',eur:'유로',jpy:'엔',yen:'엔',cny:'위안',yuan:'위안',gbp:'파운드',vix:'VIX',treasury:'국채',bond:'채권',ktb:'국고채',etf:'ETF',
  rate:'금리',apt:'아파트',pop:'인구',seoul:'서울',busan:'부산',gangnam:'강남'};
async function searchLoad(){
  if(SEARCH.loading)return SEARCH.loading;
  SEARCH.loading=Promise.all([requestJSON('./data/search/index.json').catch(()=>null),requestJSON('./data/search/places.json').catch(()=>null)])
    .then(([a,b])=>{SEARCH.idx=a;SEARCH.places=b;SEARCH.entries=null;if(!a)SEARCH.loading=null});
  return SEARCH.loading;
}
function searchEntries(){
  if(SEARCH.entries)return SEARCH.entries;
  const E=[],add=(g,label,sub,ref,extra)=>{const n=normS(label);E.push({g,label,sub,ref,n,c:choOf(n),x:String(extra||'').split(/\s+/).map(normS).filter(Boolean)})};
  for(const {code,name} of FX)if(state.fx?.currencies?.[code])add('환율',`${name} (${code})`,'환율',{t:'ind',kind:'fx',id:code},code);
  for(const [k,m] of Object.entries(state.market?.items||{})){const cat=marketCat(m);add(GROUPS.find(g=>g[0]===groupOf(cat))?.[1]||'지표',m.name||k,categories().find(c=>c.id===cat)?.label||cat.replace('macro:',''),{t:'ind',kind:'market',id:k},`${k} ${m.symbol||''}`)}
  for(const kind of MACRO)for(const [k,m] of Object.entries(state[kind]?.items||{})){const cat=catOfSel(kind,k);add(GROUPS.find(g=>g[0]===groupOf(cat))?.[1]||'지표',m.name||k,macroGroup(m),{t:'ind',kind,id:k},k)}
  const I=SEARCH.idx||{};
  for(const [code,name] of I.etf||[])add('ETF',name,code,{t:'etf',id:code},code);
  for(const [code,name,mkt] of I.stock||[])add('주식',name,`${code} · ${mkt||''}`,{t:'stock',id:code,name},code);
  const sidoName=Object.fromEntries(I.realty_sido||[]);
  for(const [c,n] of I.realty_sido||[])add('부동산',n,'시도',{t:'realty',path:[c]});
  for(const [c,n] of I.realty_sgg||[])add('부동산',n,sidoName[c.slice(0,2)]||'',{t:'realty',path:[c.slice(0,2),c]});
  const sggName=Object.fromEntries(I.realty_sgg||[]),B={apt:'아파트',offi:'오피스텔',rh:'빌라'};
  for(const [sg,d] of SEARCH.places?.dong||[])add('부동산',d,`${sggName[sg]||sg} 법정동`,{t:'realty',path:[sg.slice(0,2),sg,d]});
  for(const [sg,d,nm,b] of SEARCH.places?.cx||[])add('부동산',nm,`${B[b]||''} · ${sggName[sg]||''} ${d}`,{t:'realty',path:[sg.slice(0,2),sg,d,nm],base:b});
  const popName=Object.fromEntries((I.pop||[]).map(x=>[x[0],x[1]]));
  const popPar=Object.fromEntries((I.pop||[]).map(x=>[x[0],x[2]]));
  for(const [c,n,par] of I.pop||[]){
    const path=!par?[c]:!popPar[par]?[par,c]:[popPar[par],par,c];   // 시도 → 시군구 → 읍면동
    add('인구',n,!par?'시도 인구':`${popName[par]||''} 인구`,{t:'pop',path});
  }
  for(const [n,type,sd] of I.inst||[])add('예금·대출 금리',n,`${type}${sd?' · '+(sidoName[sd]||''):''}`,{t:'inst'});
  SEARCH.entries=E;return E;
}
function searchFind(q){
  q=normS(q);if(!q)return [];
  const qs=[q];const al=SEARCH_ALIAS[q]||Object.entries(SEARCH_ALIAS).find(([k])=>k.startsWith(q)&&q.length>=3)?.[1];if(al)qs.push(normS(al));
  const choOnly=/^[ㄱ-ㅎ]+$/.test(q);
  const hits=[];
  for(const e of searchEntries()){
    let sc=99;
    for(const k of qs){
      if(e.x.includes(k))sc=Math.min(sc,0);                       // 종목코드·기호가 딱 맞음
      else if(e.n===k)sc=Math.min(sc,0.5);
      else if(e.n.startsWith(k)||(k.length>=3&&e.x.some(x=>x.startsWith(k))))sc=Math.min(sc,1);   // 앞부분 일치 (코드는 3자 이상)
      else if(e.n.includes(k))sc=Math.min(sc,2);
    }
    if(sc===99&&choOnly&&e.c.includes(q))sc=e.c.startsWith(q)?2.5:3;
    if(sc<99)hits.push([sc,e]);
  }
  hits.sort((a,b)=>a[0]-b[0]||a[1].n.length-b[1].n.length);
  return hits.slice(0,8).map(h=>h[1]);
}
function searchRecent(){try{return JSON.parse(localStorage.getItem('mr_search_recent')||'[]')}catch(e){return []}}
function searchRemember(e){try{const r=searchRecent().filter(x=>x.label!==e.label||x.sub!==e.sub);r.unshift({g:e.g,label:e.label,sub:e.sub,ref:e.ref});localStorage.setItem('mr_search_recent',JSON.stringify(r.slice(0,5)))}catch(_){}}
function searchShow(list,title){
  const box=id('search-results');box.replaceChildren();
  if(title){const h=document.createElement('div');h.className='search-head';h.textContent=title;box.appendChild(h)}
  if(!list.length){const d=document.createElement('div');d.className='search-empty';d.textContent=title?'최근 검색이 없습니다':'찾는 항목이 없습니다';box.appendChild(d)}
  const groups=[];for(const e of list){let g=groups.find(x=>x[0]===e.g);if(!g)groups.push(g=[e.g,[]]);g[1].push(e)}
  for(const [g,es] of groups){
    const h=document.createElement('div');h.className='search-group';h.textContent=g;box.appendChild(h);
    for(const e of es){const b=document.createElement('button');b.type='button';b.className='search-item';b.setAttribute('role','option');
      const l=document.createElement('span');l.textContent=e.label;const s2=document.createElement('small');s2.textContent=e.sub||'';b.append(l,s2);
      b.addEventListener('click',()=>{searchRemember(e);searchGo(e.ref);searchClose()});box.appendChild(b)}
  }
  box.hidden=false;
}
function searchGo(ref){
  if(ref.t==='ind'){
    const cat=catOfSel(ref.kind,ref.id);selectCategory(cat);
    const it=itemsOf(cat).find(i=>i.kind===ref.kind&&String(i.id)===String(ref.id));if(it)selectItem(it);
  }else if(ref.t==='etf'){selectCategory(ETF_CAT);if(state.etf?.items?.[ref.id])selectItem(etfItem(ref.id))}
  else if(ref.t==='realty'){
    const r=state.rmap;if(ref.base&&ref.base!==r.base){r.base=ref.base;r.deal='trade'}
    r.kind=rmapKindOf(r.base,r.deal);r.path=ref.path;r.long=null;id('rmap-long').hidden=true;
    if(state.cat===RMAP_CAT)renderTiles();else selectCategory(RMAP_CAT);
  }else if(ref.t==='pop'){state.pmap.path=ref.path;if(state.cat===PMAP_CAT)renderTiles();else selectCategory(PMAP_CAT)}
  else if(ref.t==='inst')selectCategory(RATE_CAT);
  else if(ref.t==='stock'){selectCategory(categories().some(c=>c.id==='지수')?'지수':FX_CAT);showNotice(`${ref.name}(${ref.id}): 주식 화면은 준비 중입니다. 금융위원회 시세를 모으는 대로 '금융 시장 › 주식'에 나옵니다.`)}
  window.scrollTo({top:0,behavior:'smooth'});
}
function searchClose(){const w=id('search');w.classList.remove('open');id('search-results').hidden=true;id('search-input').value='';id('search-input').blur()}
(function initSearch(){
  const w=id('search'),inp=id('search-input');if(!w)return;
  let t=null;
  const run=()=>{const q=inp.value.trim();if(!q){searchShow(searchRecent(),'최근 검색');return}
    if(!SEARCH.idx)searchLoad().then(()=>{SEARCH.entries=null;if(inp.value.trim()===q)searchShow(searchFind(q))});
    searchShow(searchFind(q))};
  id('search-open').addEventListener('click',()=>{w.classList.add('open');inp.focus()});
  id('search-close').addEventListener('click',searchClose);
  inp.addEventListener('focus',()=>{searchLoad();run()});
  inp.addEventListener('input',()=>{clearTimeout(t);t=setTimeout(run,80)});
  inp.addEventListener('keydown',e=>{if(e.key==='Escape')searchClose();if(e.key==='Enter'){const f=id('search-results').querySelector('.search-item');if(f)f.click()}});
  document.addEventListener('pointerdown',e=>{if(!w.contains(e.target)){w.classList.remove('open');id('search-results').hidden=true}});
})();

initControls();
renderCategories();renderSelected();renderTiles();renderCombo();
refresh();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
