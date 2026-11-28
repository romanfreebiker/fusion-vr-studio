// Bootstrap only. No authorization endpoints are enabled until D1 and identity are configured.
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const headers = {"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
    if (request.method === "GET" && url.pathname === "/health") {
      return new Response(JSON.stringify({service:"eskala-permisos",version:160,ready:false,stage:"bootstrap"}),{status:200,headers});
    }
    return new Response(JSON.stringify({error:"Servicio de permisos pendiente de configuracion"}),{status:503,headers});
  }
};
