import * as XLSX from "xlsx";
// ============================================================
// GASTOS IA - CLOUDFLARE WORKER
// Telegram + WhatsApp/Meta
// Clasificador determinístico inicial
// ============================================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ==========================================================
    // CONFIGURACIÓN DEL WEBHOOK DE TELEGRAM
    // ==========================================================

    if (
      request.method === "GET" &&
      url.pathname === "/telegram/setup"
    ) {
      const key = url.searchParams.get("key");

      if (
        !env.TELEGRAM_WEBHOOK_SECRET ||
        key !== env.TELEGRAM_WEBHOOK_SECRET
      ) {
        return new Response("Unauthorized", {
          status: 401
        });
      }

      if (!env.TELEGRAM_BOT_TOKEN) {
        return new Response(
          "Falta TELEGRAM_BOT_TOKEN",
          { status: 500 }
        );
      }

      const webhookUrl = `${url.origin}/`;

      const telegramResponse = await fetch(
        `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            url: webhookUrl,
            secret_token: env.TELEGRAM_WEBHOOK_SECRET,
            allowed_updates: ["message", "callback_query"]
          })
        }
      );

      const telegramResult =
        await telegramResponse.json();

      return Response.json({
        ok: telegramResult.ok,
        telegram: telegramResult
      });
    }

    // ==========================================================
    // CATÁLOGO PARA MI PRESUPUESTO - SOLO LECTURA
    // No modifica ninguna tabla. Expone únicamente categorías y
    // subcategorías activas desde D1 para la app de presupuesto.
    // ==========================================================
    if (request.method === "GET" && url.pathname === "/presupuesto/catalogo") {
      try {
        if (!env.DB) {
          return Response.json({ ok: false, error: "DB no disponible" }, { status: 500, headers: { "Access-Control-Allow-Origin": "*" } });
        }
        const categorias = await env.DB.prepare(`
          SELECT id, nombre, orden, activa, external_id
          FROM categorias
          WHERE activa = 1
          ORDER BY orden ASC, nombre COLLATE NOCASE ASC
        `).all();
        const subcategorias = await env.DB.prepare(`
          SELECT id, categoria_id, nombre, orden, activa, external_id
          FROM subcategorias
          WHERE activa = 1
          ORDER BY categoria_id, orden ASC, nombre COLLATE NOCASE ASC
        `).all();
        return Response.json({ ok: true, source: "cloudflare-d1", categorias: categorias.results || [], subcategorias: subcategorias.results || [] }, { status: 200, headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } });
      } catch (error) {
        return Response.json({ ok: false, error: String(error?.message || error) }, { status: 500, headers: { "Access-Control-Allow-Origin": "*" } });
      }
    }

    // ==========================================================
    // FASE 3 - AHORROS E INGRESOS PARA MI PRESUPUESTO
    // SOLO LECTURA EN ESTA PRIMERA PRUEBA.
    // No modifica ninguna tabla ni altera Telegram/Gastos.
    // ==========================================================

    const presupuestoCors = {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store"
    };

    // ----------------------------------------------------------
    // AHORROS: categorías + productos
    // GET /presupuesto/ahorros
    // ----------------------------------------------------------
    if (request.method === "GET" && url.pathname === "/presupuesto/ahorros") {
      try {
        if (!env.DB) {
          return Response.json({ ok: false, error: "DB no disponible" }, { status: 500, headers: presupuestoCors });
        }

        const categorias = await env.DB.prepare(`
          SELECT id, nombre, orden, activa, created_at, updated_at
          FROM presupuesto_ahorro_categorias
          WHERE activa = 1
          ORDER BY orden ASC, nombre COLLATE NOCASE ASC
        `).all();

        const productos = await env.DB.prepare(`
          SELECT id, categoria_id, nombre, moneda, orden, activo, home_visible, created_at, updated_at
          FROM presupuesto_ahorro_productos
          WHERE activo = 1
          ORDER BY categoria_id, orden ASC, nombre COLLATE NOCASE ASC
        `).all();

        return Response.json({
          ok: true,
          source: "cloudflare-d1",
          categorias: categorias.results || [],
          productos: productos.results || []
        }, { status: 200, headers: presupuestoCors });
      } catch (error) {
        return Response.json({
          ok: false,
          error: String(error?.message || error)
        }, { status: 500, headers: presupuestoCors });
      }
    }

    // ----------------------------------------------------------
    // AHORROS: saldos de un mes
    // GET /presupuesto/ahorros/saldos?mes=YYYY-MM
    // ----------------------------------------------------------
    if (request.method === "GET" && url.pathname === "/presupuesto/ahorros/saldos") {
      try {
        if (!env.DB) {
          return Response.json({ ok: false, error: "DB no disponible" }, { status: 500, headers: presupuestoCors });
        }

        const mes = String(url.searchParams.get("mes") || "").trim();
        if (!/^\d{4}-\d{2}$/.test(mes)) {
          return Response.json({ ok: false, error: "Mes inválido. Usa YYYY-MM." }, { status: 400, headers: presupuestoCors });
        }

        const saldos = await env.DB.prepare(`
          SELECT id, producto_id, mes, saldo, created_at, updated_at
          FROM presupuesto_ahorro_saldos
          WHERE mes = ?
          ORDER BY producto_id
        `).bind(mes).all();

        return Response.json({
          ok: true,
          source: "cloudflare-d1",
          mes,
          saldos: saldos.results || []
        }, { status: 200, headers: presupuestoCors });
      } catch (error) {
        return Response.json({ ok: false, error: String(error?.message || error) }, { status: 500, headers: presupuestoCors });
      }
    }

    // ----------------------------------------------------------
    // INGRESOS: categorías + subcategorías
    // GET /presupuesto/ingresos
    // ----------------------------------------------------------
    if (request.method === "GET" && url.pathname === "/presupuesto/ingresos") {
      try {
        if (!env.DB) {
          return Response.json({ ok: false, error: "DB no disponible" }, { status: 500, headers: presupuestoCors });
        }

        const categorias = await env.DB.prepare(`
          SELECT id, nombre, orden, activa, created_at, updated_at
          FROM presupuesto_ingreso_categorias
          WHERE activa = 1
          ORDER BY orden ASC, nombre COLLATE NOCASE ASC
        `).all();

        const subcategorias = await env.DB.prepare(`
          SELECT id, categoria_id, nombre, orden, activa, created_at, updated_at
          FROM presupuesto_ingreso_subcategorias
          WHERE activa = 1
          ORDER BY categoria_id, orden ASC, nombre COLLATE NOCASE ASC
        `).all();

        return Response.json({
          ok: true,
          source: "cloudflare-d1",
          categorias: categorias.results || [],
          subcategorias: subcategorias.results || []
        }, { status: 200, headers: presupuestoCors });
      } catch (error) {
        return Response.json({ ok: false, error: String(error?.message || error) }, { status: 500, headers: presupuestoCors });
      }
    }

    // ----------------------------------------------------------
    // INGRESOS: valores de un mes
    // GET /presupuesto/ingresos/valores?mes=YYYY-MM
    // ----------------------------------------------------------
    if (request.method === "GET" && url.pathname === "/presupuesto/ingresos/valores") {
      try {
        if (!env.DB) {
          return Response.json({ ok: false, error: "DB no disponible" }, { status: 500, headers: presupuestoCors });
        }

        const mes = String(url.searchParams.get("mes") || "").trim();
        if (!/^\d{4}-\d{2}$/.test(mes)) {
          return Response.json({ ok: false, error: "Mes inválido. Usa YYYY-MM." }, { status: 400, headers: presupuestoCors });
        }

        const valores = await env.DB.prepare(`
          SELECT id, subcategoria_id, mes, valor, created_at, updated_at
          FROM presupuesto_ingreso_valores
          WHERE mes = ?
          ORDER BY subcategoria_id
        `).bind(mes).all();

        return Response.json({
          ok: true,
          source: "cloudflare-d1",
          mes,
          valores: valores.results || []
        }, { status: 200, headers: presupuestoCors });
      } catch (error) {
        return Response.json({ ok: false, error: String(error?.message || error) }, { status: 500, headers: presupuestoCors });
      }
    }

    // ==========================================================
    // VERIFICACIÓN META / WHATSAPP
    // ==========================================================

    if (request.method === "GET" && url.pathname === "/health") {
      try {
        const dbOk = !!env.DB;
        let dbQuery = false;
        if (dbOk) {
          await env.DB.prepare("SELECT 1").first();
          dbQuery = true;
        }
        return Response.json({
          ok: true,
          db_binding: dbOk,
          db_query: dbQuery,
          version: "V62-FOTO-EXCEL-PAGINACION-REPORTES"
        });
      } catch (error) {
        return Response.json({
          ok: false,
          db_binding: !!env.DB,
          db_query: false,
          version: "V62-FOTO-EXCEL-PAGINACION-REPORTES",
          error: String(error?.message || error)
        }, { status: 500 });
      }
    }

    if (request.method === "GET" && url.pathname === "/telegram/webhook-info") {
      const key = url.searchParams.get("key");
      if (!env.TELEGRAM_WEBHOOK_SECRET || key !== env.TELEGRAM_WEBHOOK_SECRET) {
        return new Response("Unauthorized", { status: 401 });
      }
      try {
        const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getWebhookInfo`);
        const j = await r.json();
        return Response.json(j, { status: r.ok ? 200 : 502 });
      } catch (error) {
        return Response.json({ ok: false, error: String(error?.message || error) }, { status: 500 });
      }
    }


    // ==========================================================
    // VALORES MENSUALES PARA MI PRESUPUESTO - SOLO LECTURA
    // Etapa 2: usa exactamente la misma fuente de movimientos que
    // /mes detallado y luego traduce el catálogo histórico al catálogo
    // ACTUAL de D1. Nunca modifica D1.
    // ==========================================================
    if (request.method === "GET" && url.pathname === "/presupuesto/gastos") {
      try {
        if (!env.DB) return Response.json({ ok:false, error:"DB no disponible" }, { status:500, headers:{"Access-Control-Allow-Origin":"*"} });
        const mes = String(url.searchParams.get("mes") || "").trim();
        if (!/^\d{4}-\d{2}$/.test(mes)) return Response.json({ok:false,error:"Mes inválido. Usa YYYY-MM."},{status:400,headers:{"Access-Control-Allow-Origin":"*"}});

        const cors = {"Access-Control-Allow-Origin":"*","Cache-Control":"no-store"};
        const normalizarMesLocal = (valor) => {
          const v = String(valor || "").trim();
          if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v.slice(0,7);
          const reparada = normalizarFechaRegistro(v);
          return reparada && /^\d{4}-\d{2}-\d{2}$/.test(reparada) ? reparada.slice(0,7) : "";
        };

        let chatId = String(url.searchParams.get("chat_id") || "").trim();
        if (!chatId) {
          const rowsChats = (await env.DB.prepare(`SELECT chat_id, fecha FROM gastos WHERE estado='confirmado'`).all()).results || [];
          const ids = [...new Set(rowsChats.filter(r => normalizarMesLocal(r.fecha) === mes).map(r => String(r.chat_id || "").trim()).filter(Boolean))];
          if (ids.length === 1) chatId = ids[0];
          else if (ids.length === 0) return Response.json({ok:true,source:"cloudflare-d1",mes,categorias:[],subcategorias:[],total:0,movimientos:0,debug:{registrosMes:0,noClasificados:0,modo:"sin-chat"}}, {status:200,headers:cors});
          else return Response.json({ok:false,error:"Hay varios chats en D1. Indica chat_id para consultar el presupuesto."},{status:400,headers:cors});
        }

        // Igual que /mes detallado: leemos los items y sumamos i.monto.
        // No dependemos de que los IDs históricos sigan siendo iguales al
        // catálogo actual. Eso era lo que hacía que V80 devolviera 0.
        const rows = (await env.DB.prepare(`
          SELECT g.id AS gasto_id, g.fecha, g.created_at,
                 i.monto, i.categoria, i.subcategoria, i.categoria_id, i.subcategoria_id
          FROM gastos g
          LEFT JOIN gasto_items i ON i.gasto_id=g.id
          WHERE g.chat_id=? AND g.estado='confirmado'
          ORDER BY g.fecha ASC, g.created_at ASC
        `).bind(chatId).all()).results || [];
        const items = rows.filter(r => normalizarMesLocal(r.fecha) === mes);

        // Catálogo ACTUAL de D1: este es el que verá mi-presupuesto.
        const catRows = (await env.DB.prepare(`
          SELECT id, nombre, orden, activa, external_id
          FROM categorias WHERE activa=1
          ORDER BY orden ASC, nombre COLLATE NOCASE ASC
        `).all()).results || [];
        const subRows = (await env.DB.prepare(`
          SELECT id, categoria_id, nombre, orden, activa, external_id
          FROM subcategorias WHERE activa=1
          ORDER BY categoria_id, orden ASC, nombre COLLATE NOCASE ASC
        `).all()).results || [];

        const norm = v => normalizarNombreReporte(v);
        const catById = new Map(catRows.map(c => [String(c.id), c]));
        const subById = new Map(subRows.map(s => [String(s.id), s]));
        const catByName = new Map(catRows.map(c => [norm(c.nombre), c]));
        const subByCatName = new Map(subRows.map(s => [`${String(s.categoria_id)}|${norm(s.nombre)}`, s]));

        // CATALOGO_FALLBACK es el catálogo que usa /mes detallado para
        // interpretar movimientos históricos. Lo usamos SOLO como puente;
        // nunca lo devolvemos como catálogo oficial a la app.
        const fallbackCatById = new Map((CATALOGO_FALLBACK.categorias||[]).map(c => [String(c.id), c]));
        const fallbackSubById = new Map((CATALOGO_FALLBACK.subcategorias||[]).map(s => [String(s.id), s]));
        const fallbackCatByName = new Map((CATALOGO_FALLBACK.categorias||[]).map(c => [norm(c.nombre), c]));
        const fallbackSubByCatName = new Map((CATALOGO_FALLBACK.subcategorias||[]).map(s => [`${String(s.categoria_id)}|${norm(s.nombre)}`, s]));

        function mapCategory(r) {
          const direct = catById.get(String(r.categoria_id||""));
          if (direct) return direct;
          const rawName = norm(r.categoria);
          const byCurrentName = catByName.get(rawName);
          if (byCurrentName) return byCurrentName;
          const fb = fallbackCatById.get(String(r.categoria_id||"")) || fallbackCatByName.get(rawName);
          if (fb) return catByName.get(norm(fb.nombre)) || null;
          return null;
        }

        function mapSubcategory(r, cat) {
          const direct = subById.get(String(r.subcategoria_id||""));
          if (direct && (!cat || String(direct.categoria_id) === String(cat.id))) return direct;
          const rawSub = norm(r.subcategoria);
          if (cat) {
            const current = subByCatName.get(`${String(cat.id)}|${rawSub}`);
            if (current) return current;
          }
          const fbCat = fallbackCatById.get(String(r.categoria_id||"")) || fallbackCatByName.get(norm(r.categoria));
          const fbSub = fallbackSubById.get(String(r.subcategoria_id||"")) ||
                        (fbCat ? fallbackSubByCatName.get(`${String(fbCat.id)}|${rawSub}`) : null) ||
                        (fbCat ? (CATALOGO_FALLBACK.subcategorias||[]).find(s => String(s.categoria_id)===String(fbCat.id) && norm(s.nombre)===rawSub) : null);
          if (fbSub) {
            const mappedCat = cat || catByName.get(norm(fbCat?.nombre||""));
            if (mappedCat) return subByCatName.get(`${String(mappedCat.id)}|${norm(fbSub.nombre)}`) || null;
          }
          return null;
        }

        const catTotals = new Map(catRows.map(c => [String(c.id), 0]));
        const subTotals = new Map(subRows.map(s => [String(s.id), 0]));
        const unmatched = [];
        let classified = 0;
        let categoryOnly = 0;

        for (const r of items) {
          const monto = Number(r.monto || 0);
          const cat = mapCategory(r);
          const sub = mapSubcategory(r, cat);
          if (cat) catTotals.set(String(cat.id), (catTotals.get(String(cat.id))||0) + monto);
          if (sub) {
            subTotals.set(String(sub.id), (subTotals.get(String(sub.id))||0) + monto);
            classified++;
          } else if (cat) {
            categoryOnly++;
            unmatched.push({categoria:cat.nombre, subcategoria:String(r.subcategoria||"Sin subcategoría"), monto});
          } else {
            unmatched.push({categoria:String(r.categoria||"Sin categoría"), subcategoria:String(r.subcategoria||"Sin subcategoría"), monto});
          }
        }

        // Devuelve TODAS las subcategorías activas del catálogo actual. Las
        // que no tuvieron movimientos van con total 0; así la app nunca
        // depende de que el endpoint "invente" categorías/subcategorías.
        const categorias = catRows.map(c => ({
          categoria_id:c.id, nombre:c.nombre, orden:c.orden,
          total:Math.round(Number(catTotals.get(String(c.id))||0))
        }));
        const subcategorias = subRows.map(s => ({
          subcategoria_id:s.id, categoria_id:s.categoria_id, nombre:s.nombre,
          orden:s.orden, total:Math.round(Number(subTotals.get(String(s.id))||0))
        }));

        // "Otros" puede aparecer en /mes detallado aunque no exista como
        // subcategoría oficial del catálogo D1. No lo inventamos en D1: lo
        // devolvemos como un EXTRA del reporte mensual para que mi-presupuesto
        // pueda mostrarlo dentro de su categoría correspondiente.
        const extrasMap = new Map();
        for (const u of unmatched) {
          const catName = String(u.categoria || 'Sin categoría').trim();
          const subName = String(u.subcategoria || 'Sin subcategoría').trim();
          const key = `${norm(catName)}|${norm(subName)}`;
          const prev = extrasMap.get(key);
          if (prev) prev.total += Number(u.monto || 0);
          else extrasMap.set(key, {categoria:catName, subcategoria:subName, total:Number(u.monto || 0), items:1});
          if (prev) prev.items += 1;
        }
        const extras = [...extrasMap.values()].map(x => ({
          categoria:x.categoria, subcategoria:x.subcategoria, total:Math.round(x.total), items:x.items
        }));

        return Response.json({
          ok:true,
          source:"cloudflare-d1",
          source_logic:"same-as-mes-detallado-with-current-catalog-bridge-v84",
          mes,
          categorias,
          subcategorias,
          total:Math.round(items.reduce((sum,r)=>sum+Number(r.monto||0),0)),
          movimientos:new Set(items.map(r=>r.gasto_id).filter(Boolean)).size,
          ultima_fecha_gasto: items.length ? items.reduce((max,r) => {
            const f = String(r.fecha || '').slice(0,10);
            return f > max ? f : max;
          }, '') : null,
          debug:{registrosMes:items.length,subitemsClasificados:classified,categoryOnly,noClasificados:unmatched.length,conCategoriaId:items.filter(r=>r.categoria_id).length,conSubcategoriaId:items.filter(r=>r.subcategoria_id).length,unmatched}
        },{status:200,headers:cors});
      } catch (error) {
        return Response.json({ok:false,error:String(error?.message||error)},{status:500,headers:{"Access-Control-Allow-Origin":"*"}});
      }
    }


    // ==========================================================
    // FASE 3 - ESCRITURA SEGURA DE AHORROS E INGRESOS
    // Estos endpoints NO deben llamarse sin una clave configurada
    // en el secret PRESUPUESTO_WRITE_KEY del Worker.
    // ==========================================================

    const presupuestoWriteCors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, X-Presupuesto-Write-Key",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Cache-Control": "no-store"
    };

    const presupuestoMesValido = (mes) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(mes || "").trim());

    const presupuestoWriteAuthorized = (request, env) => {
      const configured = String(env.PRESUPUESTO_WRITE_KEY || "").trim();
      const supplied = String(request.headers.get("X-Presupuesto-Write-Key") || "").trim();
      return Boolean(configured && supplied && configured === supplied);
    };

    // ----------------------------------------------------------
    // OPTIONS para las escrituras desde mi-presupuesto
    // ----------------------------------------------------------
    if (request.method === "OPTIONS" && url.pathname.startsWith("/presupuesto/")) {
      return new Response(null, { status: 204, headers: presupuestoWriteCors });
    }

    // ----------------------------------------------------------
    // AHORROS: guardar/actualizar saldo de un producto y mes
    // POST /presupuesto/ahorros/saldos
    // Body: { producto_id, mes, saldo }
    // ----------------------------------------------------------
    if (request.method === "POST" && url.pathname === "/presupuesto/ahorros/saldos") {
      try {
        if (!env.DB) {
          return Response.json({ ok:false, error:"DB no disponible" }, { status:500, headers:presupuestoWriteCors });
        }
        if (!presupuestoWriteAuthorized(request, env)) {
          return Response.json({ ok:false, error:"No autorizado" }, { status:401, headers:presupuestoWriteCors });
        }

        const body = await request.json();
        const producto_id = String(body?.producto_id || "").trim();
        const mes = String(body?.mes || "").trim();
        const saldo = Number(body?.saldo);

        if (!producto_id) {
          return Response.json({ ok:false, error:"producto_id es obligatorio" }, { status:400, headers:presupuestoWriteCors });
        }
        if (!presupuestoMesValido(mes)) {
          return Response.json({ ok:false, error:"Mes inválido. Usa YYYY-MM." }, { status:400, headers:presupuestoWriteCors });
        }
        if (!Number.isFinite(saldo) || saldo < 0) {
          return Response.json({ ok:false, error:"saldo debe ser un número mayor o igual a 0" }, { status:400, headers:presupuestoWriteCors });
        }

        const producto = await env.DB.prepare(`
          SELECT id, moneda, activo
          FROM presupuesto_ahorro_productos
          WHERE id = ? AND activo = 1
          LIMIT 1
        `).bind(producto_id).first();

        if (!producto) {
          return Response.json({ ok:false, error:"Producto de ahorro no encontrado o inactivo" }, { status:404, headers:presupuestoWriteCors });
        }

        const id = `saldo-${producto_id}-${mes}`;
        await env.DB.prepare(`
          INSERT INTO presupuesto_ahorro_saldos
            (id, producto_id, mes, saldo, created_at, updated_at)
          VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
          ON CONFLICT(producto_id, mes) DO UPDATE SET
            saldo = excluded.saldo,
            updated_at = datetime('now')
        `).bind(id, producto_id, mes, saldo).run();

        const saved = await env.DB.prepare(`
          SELECT id, producto_id, mes, saldo, created_at, updated_at
          FROM presupuesto_ahorro_saldos
          WHERE producto_id = ? AND mes = ?
          LIMIT 1
        `).bind(producto_id, mes).first();

        return Response.json({ ok:true, source:"cloudflare-d1", saved }, { status:200, headers:presupuestoWriteCors });
      } catch (error) {
        return Response.json({ ok:false, error:String(error?.message || error) }, { status:500, headers:presupuestoWriteCors });
      }
    }

    // ----------------------------------------------------------
    // INGRESOS: guardar/actualizar valor de una subcategoría y mes
    // POST /presupuesto/ingresos/valores
    // Body: { subcategoria_id, mes, valor }
    // ----------------------------------------------------------
    if (request.method === "POST" && url.pathname === "/presupuesto/ingresos/valores") {
      try {
        if (!env.DB) {
          return Response.json({ ok:false, error:"DB no disponible" }, { status:500, headers:presupuestoWriteCors });
        }
        if (!presupuestoWriteAuthorized(request, env)) {
          return Response.json({ ok:false, error:"No autorizado" }, { status:401, headers:presupuestoWriteCors });
        }

        const body = await request.json();
        const subcategoria_id = String(body?.subcategoria_id || "").trim();
        const mes = String(body?.mes || "").trim();
        const valor = Number(body?.valor);

        if (!subcategoria_id) {
          return Response.json({ ok:false, error:"subcategoria_id es obligatorio" }, { status:400, headers:presupuestoWriteCors });
        }
        if (!presupuestoMesValido(mes)) {
          return Response.json({ ok:false, error:"Mes inválido. Usa YYYY-MM." }, { status:400, headers:presupuestoWriteCors });
        }
        if (!Number.isFinite(valor)) {
          return Response.json({ ok:false, error:"valor debe ser un número válido" }, { status:400, headers:presupuestoWriteCors });
        }

        const subcategoria = await env.DB.prepare(`
          SELECT id, categoria_id, activa
          FROM presupuesto_ingreso_subcategorias
          WHERE id = ? AND activa = 1
          LIMIT 1
        `).bind(subcategoria_id).first();

        if (!subcategoria) {
          return Response.json({ ok:false, error:"Subcategoría de ingreso no encontrada o inactiva" }, { status:404, headers:presupuestoWriteCors });
        }

        const id = `ingreso-${subcategoria_id}-${mes}`;
        await env.DB.prepare(`
          INSERT INTO presupuesto_ingreso_valores
            (id, subcategoria_id, mes, valor, created_at, updated_at)
          VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
          ON CONFLICT(subcategoria_id, mes) DO UPDATE SET
            valor = excluded.valor,
            updated_at = datetime('now')
        `).bind(id, subcategoria_id, mes, valor).run();

        const saved = await env.DB.prepare(`
          SELECT id, subcategoria_id, mes, valor, created_at, updated_at
          FROM presupuesto_ingreso_valores
          WHERE subcategoria_id = ? AND mes = ?
          LIMIT 1
        `).bind(subcategoria_id, mes).first();

        return Response.json({ ok:true, source:"cloudflare-d1", saved }, { status:200, headers:presupuestoWriteCors });
      } catch (error) {
        return Response.json({ ok:false, error:String(error?.message || error) }, { status:500, headers:presupuestoWriteCors });
      }
    }


    // ==========================================================
    // FASE 3 - GESTIÓN DE CUENTAS E INGRESOS (CRUD)
    // Crear, renombrar, mover, cambiar moneda/visibilidad y eliminar
    // de forma lógica. Los valores históricos no se borran.
    // ==========================================================

    // AHORROS: crear cuenta/producto
    if (request.method === "POST" && url.pathname === "/presupuesto/ahorros/productos") {
      try {
        if (!env.DB) return Response.json({ok:false,error:"DB no disponible"},{status:500,headers:presupuestoWriteCors});
        if (!presupuestoWriteAuthorized(request,env)) return Response.json({ok:false,error:"No autorizado"},{status:401,headers:presupuestoWriteCors});
        const body=await request.json();
        const categoria_id=String(body?.categoria_id||"").trim();
        const nombre=String(body?.nombre||"").trim();
        const moneda=String(body?.moneda||"COP").trim().toUpperCase();
        if(!categoria_id||!nombre) return Response.json({ok:false,error:"categoria_id y nombre son obligatorios"},{status:400,headers:presupuestoWriteCors});
        if(!["COP","USD"].includes(moneda)) return Response.json({ok:false,error:"moneda debe ser COP o USD"},{status:400,headers:presupuestoWriteCors});
        const cat=await env.DB.prepare(`SELECT id,nombre,activa FROM presupuesto_ahorro_categorias WHERE id=? AND activa=1 LIMIT 1`).bind(categoria_id).first();
        if(!cat) return Response.json({ok:false,error:"Categoría de ahorro no encontrada o inactiva"},{status:404,headers:presupuestoWriteCors});
        const dup=await env.DB.prepare(`SELECT id FROM presupuesto_ahorro_productos WHERE categoria_id=? AND lower(trim(nombre))=lower(trim(?)) AND activo=1 LIMIT 1`).bind(categoria_id,nombre).first();
        if(dup) return Response.json({ok:false,error:"Ya existe una cuenta con ese nombre en esa categoría"},{status:409,headers:presupuestoWriteCors});
        const mx=await env.DB.prepare(`SELECT COALESCE(MAX(orden),-1)+1 AS orden FROM presupuesto_ahorro_productos WHERE categoria_id=?`).bind(categoria_id).first();
        const id=`ast-${crypto.randomUUID()}`;
        await env.DB.prepare(`INSERT INTO presupuesto_ahorro_productos (id,categoria_id,nombre,moneda,orden,activo,home_visible,created_at,updated_at) VALUES (?,?,?,?,?,1,0,datetime('now'),datetime('now'))`).bind(id,categoria_id,nombre,moneda,Number(mx?.orden||0)).run();
        const saved=await env.DB.prepare(`SELECT id,categoria_id,nombre,moneda,orden,activo,home_visible,created_at,updated_at FROM presupuesto_ahorro_productos WHERE id=?`).bind(id).first();
        return Response.json({ok:true,source:"cloudflare-d1",saved},{status:200,headers:presupuestoWriteCors});
      } catch(error){return Response.json({ok:false,error:String(error?.message||error)},{status:500,headers:presupuestoWriteCors});}
    }

    // AHORROS: actualizar cuenta/producto
    if ((request.method === "PATCH" || request.method === "POST") && url.pathname.startsWith("/presupuesto/ahorros/productos/") && url.pathname !== "/presupuesto/ahorros/productos") {
      try {
        if (!env.DB) return Response.json({ok:false,error:"DB no disponible"},{status:500,headers:presupuestoWriteCors});
        if (!presupuestoWriteAuthorized(request,env)) return Response.json({ok:false,error:"No autorizado"},{status:401,headers:presupuestoWriteCors});
        const id=decodeURIComponent(url.pathname.split('/').pop()||''); const body=await request.json();
        const current=await env.DB.prepare(`SELECT id,categoria_id,nombre,moneda,orden,home_visible,activo FROM presupuesto_ahorro_productos WHERE id=? LIMIT 1`).bind(id).first();
        if(!current||Number(current.activo)!==1) return Response.json({ok:false,error:"Cuenta no encontrada o inactiva"},{status:404,headers:presupuestoWriteCors});
        const categoria_id=body?.categoria_id!=null?String(body.categoria_id).trim():String(current.categoria_id);
        const nombre=body?.nombre!=null?String(body.nombre).trim():String(current.nombre);
        const moneda=body?.moneda!=null?String(body.moneda).trim().toUpperCase():String(current.moneda);
        const home_visible=body?.home_visible!=null?(Number(body.home_visible)?1:0):Number(current.home_visible||0);
        const orden=body?.orden!=null?Number(body.orden):Number(current.orden||0);
        if(!nombre) return Response.json({ok:false,error:"nombre no puede estar vacío"},{status:400,headers:presupuestoWriteCors});
        if(!["COP","USD"].includes(moneda)) return Response.json({ok:false,error:"moneda debe ser COP o USD"},{status:400,headers:presupuestoWriteCors});
        const cat=await env.DB.prepare(`SELECT id FROM presupuesto_ahorro_categorias WHERE id=? AND activa=1 LIMIT 1`).bind(categoria_id).first();
        if(!cat) return Response.json({ok:false,error:"Categoría no encontrada o inactiva"},{status:404,headers:presupuestoWriteCors});
        const dup=await env.DB.prepare(`SELECT id FROM presupuesto_ahorro_productos WHERE categoria_id=? AND lower(trim(nombre))=lower(trim(?)) AND activo=1 AND id<>? LIMIT 1`).bind(categoria_id,nombre,id).first();
        if(dup) return Response.json({ok:false,error:"Ya existe una cuenta con ese nombre en esa categoría"},{status:409,headers:presupuestoWriteCors});
        await env.DB.prepare(`UPDATE presupuesto_ahorro_productos SET categoria_id=?,nombre=?,moneda=?,orden=?,home_visible=?,updated_at=datetime('now') WHERE id=?`).bind(categoria_id,nombre,moneda,orden,home_visible,id).run();
        const saved=await env.DB.prepare(`SELECT id,categoria_id,nombre,moneda,orden,activo,home_visible,created_at,updated_at FROM presupuesto_ahorro_productos WHERE id=?`).bind(id).first();
        return Response.json({ok:true,source:"cloudflare-d1",saved},{status:200,headers:presupuestoWriteCors});
      }catch(error){return Response.json({ok:false,error:String(error?.message||error)},{status:500,headers:presupuestoWriteCors});}
    }

    // AHORROS: eliminar lógicamente, conservando saldos históricos
    if (request.method === "DELETE" && url.pathname.startsWith("/presupuesto/ahorros/productos/") && url.pathname !== "/presupuesto/ahorros/productos") {
      try {
        if (!env.DB) return Response.json({ok:false,error:"DB no disponible"},{status:500,headers:presupuestoWriteCors});
        if (!presupuestoWriteAuthorized(request,env)) return Response.json({ok:false,error:"No autorizado"},{status:401,headers:presupuestoWriteCors});
        const id=decodeURIComponent(url.pathname.split('/').pop()||'');
        const current=await env.DB.prepare(`SELECT id,nombre,activo FROM presupuesto_ahorro_productos WHERE id=? LIMIT 1`).bind(id).first();
        if(!current||Number(current.activo)!==1) return Response.json({ok:false,error:"Cuenta no encontrada o ya inactiva"},{status:404,headers:presupuestoWriteCors});
        await env.DB.prepare(`UPDATE presupuesto_ahorro_productos SET activo=0,updated_at=datetime('now') WHERE id=?`).bind(id).run();
        const saved=await env.DB.prepare(`SELECT id,nombre,activo,updated_at FROM presupuesto_ahorro_productos WHERE id=?`).bind(id).first();
        return Response.json({ok:true,source:"cloudflare-d1",deleted:true,saved},{status:200,headers:presupuestoWriteCors});
      }catch(error){return Response.json({ok:false,error:String(error?.message||error)},{status:500,headers:presupuestoWriteCors});}
    }

    // INGRESOS: crear subcategoría/ingreso
    if (request.method === "POST" && url.pathname === "/presupuesto/ingresos/subcategorias") {
      try {
        if (!env.DB) return Response.json({ok:false,error:"DB no disponible"},{status:500,headers:presupuestoWriteCors});
        if (!presupuestoWriteAuthorized(request,env)) return Response.json({ok:false,error:"No autorizado"},{status:401,headers:presupuestoWriteCors});
        const body=await request.json(); const categoria_id=String(body?.categoria_id||"").trim(); const nombre=String(body?.nombre||"").trim();
        if(!categoria_id||!nombre) return Response.json({ok:false,error:"categoria_id y nombre son obligatorios"},{status:400,headers:presupuestoWriteCors});
        const cat=await env.DB.prepare(`SELECT id,nombre,activa FROM presupuesto_ingreso_categorias WHERE id=? AND activa=1 LIMIT 1`).bind(categoria_id).first();
        if(!cat) return Response.json({ok:false,error:"Categoría de ingreso no encontrada o inactiva"},{status:404,headers:presupuestoWriteCors});
        const dup=await env.DB.prepare(`SELECT id FROM presupuesto_ingreso_subcategorias WHERE categoria_id=? AND lower(trim(nombre))=lower(trim(?)) AND activa=1 LIMIT 1`).bind(categoria_id,nombre).first();
        if(dup) return Response.json({ok:false,error:"Ya existe ese ingreso en esa categoría"},{status:409,headers:presupuestoWriteCors});
        const mx=await env.DB.prepare(`SELECT COALESCE(MAX(orden),-1)+1 AS orden FROM presupuesto_ingreso_subcategorias WHERE categoria_id=?`).bind(categoria_id).first();
        const id=`ing-sub-${crypto.randomUUID()}`;
        await env.DB.prepare(`INSERT INTO presupuesto_ingreso_subcategorias (id,categoria_id,nombre,orden,activa,created_at,updated_at) VALUES (?,?,?,?,1,datetime('now'),datetime('now'))`).bind(id,categoria_id,nombre,Number(mx?.orden||0)).run();
        const saved=await env.DB.prepare(`SELECT id,categoria_id,nombre,orden,activa,created_at,updated_at FROM presupuesto_ingreso_subcategorias WHERE id=?`).bind(id).first();
        return Response.json({ok:true,source:"cloudflare-d1",saved},{status:200,headers:presupuestoWriteCors});
      }catch(error){return Response.json({ok:false,error:String(error?.message||error)},{status:500,headers:presupuestoWriteCors});}
    }

    // INGRESOS: actualizar subcategoría/ingreso
    if ((request.method === "PATCH" || request.method === "POST") && url.pathname.startsWith("/presupuesto/ingresos/subcategorias/") && url.pathname !== "/presupuesto/ingresos/subcategorias") {
      try {
        if (!env.DB) return Response.json({ok:false,error:"DB no disponible"},{status:500,headers:presupuestoWriteCors});
        if (!presupuestoWriteAuthorized(request,env)) return Response.json({ok:false,error:"No autorizado"},{status:401,headers:presupuestoWriteCors});
        const id=decodeURIComponent(url.pathname.split('/').pop()||''); const body=await request.json();
        const current=await env.DB.prepare(`SELECT id,categoria_id,nombre,orden,activa FROM presupuesto_ingreso_subcategorias WHERE id=? LIMIT 1`).bind(id).first();
        if(!current||Number(current.activa)!==1) return Response.json({ok:false,error:"Ingreso no encontrado o inactivo"},{status:404,headers:presupuestoWriteCors});
        const categoria_id=body?.categoria_id!=null?String(body.categoria_id).trim():String(current.categoria_id); const nombre=body?.nombre!=null?String(body.nombre).trim():String(current.nombre); const orden=body?.orden!=null?Number(body.orden):Number(current.orden||0);
        if(!nombre) return Response.json({ok:false,error:"nombre no puede estar vacío"},{status:400,headers:presupuestoWriteCors});
        const cat=await env.DB.prepare(`SELECT id FROM presupuesto_ingreso_categorias WHERE id=? AND activa=1 LIMIT 1`).bind(categoria_id).first(); if(!cat)return Response.json({ok:false,error:"Categoría no encontrada o inactiva"},{status:404,headers:presupuestoWriteCors});
        const dup=await env.DB.prepare(`SELECT id FROM presupuesto_ingreso_subcategorias WHERE categoria_id=? AND lower(trim(nombre))=lower(trim(?)) AND activa=1 AND id<>? LIMIT 1`).bind(categoria_id,nombre,id).first(); if(dup)return Response.json({ok:false,error:"Ya existe ese ingreso en esa categoría"},{status:409,headers:presupuestoWriteCors});
        await env.DB.prepare(`UPDATE presupuesto_ingreso_subcategorias SET categoria_id=?,nombre=?,orden=?,updated_at=datetime('now') WHERE id=?`).bind(categoria_id,nombre,orden,id).run();
        const saved=await env.DB.prepare(`SELECT id,categoria_id,nombre,orden,activa,created_at,updated_at FROM presupuesto_ingreso_subcategorias WHERE id=?`).bind(id).first();
        return Response.json({ok:true,source:"cloudflare-d1",saved},{status:200,headers:presupuestoWriteCors});
      }catch(error){return Response.json({ok:false,error:String(error?.message||error)},{status:500,headers:presupuestoWriteCors});}
    }

    // INGRESOS: eliminar lógicamente, conservando valores históricos
    if (request.method === "DELETE" && url.pathname.startsWith("/presupuesto/ingresos/subcategorias/") && url.pathname !== "/presupuesto/ingresos/subcategorias") {
      try {
        if (!env.DB) return Response.json({ok:false,error:"DB no disponible"},{status:500,headers:presupuestoWriteCors});
        if (!presupuestoWriteAuthorized(request,env)) return Response.json({ok:false,error:"No autorizado"},{status:401,headers:presupuestoWriteCors});
        const id=decodeURIComponent(url.pathname.split('/').pop()||''); const current=await env.DB.prepare(`SELECT id,nombre,activa FROM presupuesto_ingreso_subcategorias WHERE id=? LIMIT 1`).bind(id).first();
        if(!current||Number(current.activa)!==1)return Response.json({ok:false,error:"Ingreso no encontrado o ya inactivo"},{status:404,headers:presupuestoWriteCors});
        await env.DB.prepare(`UPDATE presupuesto_ingreso_subcategorias SET activa=0,updated_at=datetime('now') WHERE id=?`).bind(id).run(); const saved=await env.DB.prepare(`SELECT id,nombre,activa,updated_at FROM presupuesto_ingreso_subcategorias WHERE id=?`).bind(id).first();
        return Response.json({ok:true,source:"cloudflare-d1",deleted:true,saved},{status:200,headers:presupuestoWriteCors});
      }catch(error){return Response.json({ok:false,error:String(error?.message||error)},{status:500,headers:presupuestoWriteCors});}
    }

    if (request.method === "GET") {
      const mode =
        url.searchParams.get("hub.mode");

      const token =
        url.searchParams.get("hub.verify_token");

      const challenge =
        url.searchParams.get("hub.challenge");

      if (mode === "subscribe") {
        if (
          token ===
          "gastos-ia-verificacion-2026"
        ) {
          return new Response(
            challenge || "",
            { status: 200 }
          );
        }

        return new Response(
          "Token de verificación incorrecto",
          { status: 403 }
        );
      }

      return new Response(
        "Gastos IA - Webhook activo",
        { status: 200 }
      );
    }

    // ==========================================================
    // SOLO POST
    // ==========================================================

    if (request.method !== "POST") {
      return new Response(
        "Method Not Allowed",
        { status: 405 }
      );
    }

    // ==========================================================
    // LEER BODY
    // ==========================================================

    let body;

    try {
      body = await request.json();
    } catch (error) {
      console.log("JSON INVALIDO");

      return new Response(
        "JSON inválido",
        { status: 400 }
      );
    }

    console.log("WEBHOOK RECIBIDO");

    // ==========================================================
    // TELEGRAM
    // ==========================================================

    if (body?.update_id && body?.callback_query) {
      return await procesarTelegramCallback(request, env, body);
    }

    if (
      body?.update_id &&
      body?.message
    ) {
      return await procesarTelegram(
        request,
        env,
        body
      );
    }

    // ==========================================================
    // EVENTO DESCONOCIDO
    // ==========================================================

    console.log(
      "Webhook no reconocido"
    );

    return new Response(
      "OK",
      { status: 200 }
    );
  }
};


// ============================================================
// PROCESAR TELEGRAM
// ============================================================

async function procesarTelegram(
  request,
  env,
  body
) {
  const telegramSecret =
    request.headers.get("X-Telegram-Bot-Api-Secret-Token");

  if (
    !env.TELEGRAM_WEBHOOK_SECRET ||
    telegramSecret !== env.TELEGRAM_WEBHOOK_SECRET
  ) {
    console.log("Telegram: secret token incorrecto");
    return new Response("Unauthorized", { status: 401 });
  }

  const message = body.message;
  const chatId = message?.chat?.id;
  const text = message?.text || "";
  const caption = message?.caption || "";
  const firstName = message?.from?.first_name || "";
  const tieneFoto = Array.isArray(message?.photo) && message.photo.length > 0;
  const tieneExcel = esDocumentoExcelTelegram(message);

  console.log("TELEGRAM MENSAJE");
  console.log(JSON.stringify({
    chatId,
    firstName,
    text,
    caption,
    tieneFoto,
    tieneExcel,
    documento: message?.document?.file_name || null
  }));

  if (!chatId) {
    return new Response("OK", { status: 200 });
  }

  // ----------------------------------------------------------
  // FASE 1 - LECTURA DE FOTOS DE MOVIMIENTOS BANCARIOS
  // Solo analiza la imagen y devuelve lo detectado.
  // NO guarda gastos en D1 todavía.
  // ----------------------------------------------------------
  if (tieneFoto) {
    try {
      const resultadoFoto = await procesarFotoMovimientosTelegram(env, chatId, message);
      const pendientesFoto = await crearPendientesDesdeFoto(env, chatId, message, resultadoFoto);
      await enviarTelegram(env, chatId, pendientesFoto.texto, pendientesFoto.replyMarkup || null);
    } catch (error) {
      console.log("ERROR PROCESANDO FOTO BANCARIA", error?.stack || error);
      await enviarTelegram(env, chatId, "⚠️ No pude analizar la foto en este momento. No se creó ningún pendiente. Intenta enviarla nuevamente.");
    }
    return new Response("OK", { status: 200 });
  }

  // ----------------------------------------------------------
  // IMPORTACIÓN DE EXCEL BANCARIO (.XLS / .XLSX)
  // El archivo sigue exactamente la misma lógica de una foto:
  // positivos/abonos -> se ignoran
  // negativos -> se convierten en pendientes uno por uno
  // repetidos -> solo generan alerta; el usuario decide
  // ----------------------------------------------------------
  if (tieneExcel) {
    try {
      const resultadoExcel = await procesarExcelMovimientosTelegram(env, chatId, message);
      const pendientesExcel = await crearPendientesDesdeExcel(env, chatId, message, resultadoExcel);
      await enviarTelegram(env, chatId, pendientesExcel.texto, pendientesExcel.replyMarkup || null);
    } catch (error) {
      console.log("ERROR PROCESANDO EXCEL BANCARIO", error?.stack || error);
      await enviarTelegram(
        env,
        chatId,
        `⚠️ No pude leer el Excel bancario. No se creó ningún pendiente.\n\nDetalle técnico: ${String(error?.message || error).slice(0, 500)}\n\nVerifica que sea un .xls o .xlsx exportado directamente por el banco e inténtalo nuevamente.`
      );
    }
    return new Response("OK", { status: 200 });
  }

  if (!text.trim()) {
    return new Response("OK", { status: 200 });
  }

  const textoNormalizado = normalizar(text);

  // ----------------------------------------------------------
  // DESCRIPCIÓN DE UNA COMPRA DETECTADA DESDE FOTO
  // ----------------------------------------------------------
  const pendienteFotoDescripcion = await obtenerPendienteFotoDescripcion(env, chatId);
  if (pendienteFotoDescripcion) {
    if (["cancelar", "salir", "volver"].includes(textoNormalizado)) {
      await actualizarEstadoPendiente(env, pendienteFotoDescripcion.id, "foto_pendiente");
      await mostrarPendienteFoto(env, chatId, pendienteFotoDescripcion.id);
      return new Response("OK", { status: 200 });
    }

    try {
      const anterior = JSON.parse(pendienteFotoDescripcion.interpretacion_json || "{}");
      const movimientoBanco = anterior.movimientos?.[0] || {};
      const descripcionUsuario = text.trim();
      if (!descripcionUsuario) {
        await enviarTelegram(env, chatId, "📝 Escribe una descripción breve, por ejemplo: \"mercado\", \"televisor\" o \"comida con Diana\".");
        return new Response("OK", { status: 200 });
      }

      // IMPORTANTE: una compra proveniente de una foto ya tiene su monto y
      // su estructura de movimiento validados por la FASE 1.
      //
      // Antes aquí volvíamos a ejecutar interpretarGasto() sobre algo como:
      // "remesa para la casa por 183770 en SUPERINTENDIA OLIMPICA 136".
      // El motor de texto podía interpretar el "136" del comercio como un
      // segundo monto y crear un segundo movimiento. Luego guardarGastoConfirmado()
      // guardaba ambos items, produciendo el falso gasto de $136.
      //
      // Solución definitiva: al agregar descripción NUNCA volvemos a construir
      // la estructura financiera. Solo usamos el texto nuevo para CLASIFICAR y
      // conservamos exactamente el monto/comercio/movimiento de la foto.
      const clasificacion = interpretarGasto(descripcionUsuario);
      const clasificacionAprendida = await aplicarAprendizajes(env, chatId, clasificacion);
      const clasificacionMovimiento = clasificacionAprendida?.movimientos?.[0] || {};

      // Clonamos el pendiente original para no perder ningún dato extraído de
      // la foto (fecha, monto, comercio, tarjeta, banco, etc.).
      const nueva = JSON.parse(JSON.stringify(anterior));
      nueva.fecha = anterior.fecha;
      nueva.monto = Number(anterior.monto || 0);
      nueva.moneda = anterior.moneda || "COP";
      nueva.tipo = "gasto";
      nueva.mensaje_original = anterior.mensaje_original || pendienteFotoDescripcion.mensaje_original;
      nueva.comercio = movimientoBanco.comercio || anterior.comercio || null;
      nueva.forma_pago = movimientoBanco.forma_pago || anterior.forma_pago || null;
      nueva.persona = movimientoBanco.persona || anterior.persona || null;
      nueva.periodicidad = null;

      // Cada pendiente creado desde una foto representa UNA fila bancaria.
      // Por seguridad, este pendiente debe tener exactamente UN movimiento.
      const movimientoOriginal = JSON.parse(JSON.stringify(movimientoBanco || {}));
      const m = movimientoOriginal;
      m.concepto = descripcionUsuario;
      m.detalle = movimientoBanco.detalle || movimientoBanco.descripcion_banco || descripcionUsuario;
      m.monto = Number(anterior.monto || 0);
      m.comercio = movimientoBanco.comercio || anterior.comercio || null;
      m.forma_pago = movimientoBanco.forma_pago || anterior.forma_pago || null;
      m.persona = movimientoBanco.persona || anterior.persona || null;

      // La descripción nueva puede mejorar la clasificación, pero jamás puede
      // introducir montos/movimientos adicionales.
      if (clasificacionMovimiento.categoria) m.categoria = clasificacionMovimiento.categoria;
      if (clasificacionMovimiento.subcategoria) m.subcategoria = clasificacionMovimiento.subcategoria;
      if (clasificacionMovimiento.confianza) m.confianza = clasificacionMovimiento.confianza;

      nueva.movimientos = [m];
      nueva.categoria = m.categoria || null;
      nueva.subcategoria = m.subcategoria || null;
      nueva.confianza_categoria = m.confianza || "media";
      nueva.estado = (!m.categoria || !m.subcategoria) ? "requiere_revision" : "pendiente";
      nueva._fuente = "foto_banco";
      nueva._telegram_file_id = anterior._telegram_file_id || null;
      nueva._descripcion_banco = movimientoBanco.descripcion_banco || anterior._descripcion_banco || "";
      nueva._descripcion_usuario = descripcionUsuario;

      await actualizarPendienteInterpretacion(env, pendienteFotoDescripcion.id, nueva);
      await actualizarEstadoPendiente(env, pendienteFotoDescripcion.id, "foto_pendiente");
      await enviarTelegram(env, chatId, crearTarjetaPendienteFoto(nueva), botonesPendienteFoto(pendienteFotoDescripcion.id));
    } catch (error) {
      console.log("ERROR AGREGANDO DESCRIPCION FOTO", error?.stack || error);
      await enviarTelegram(env, chatId, "⚠️ No pude actualizar la descripción. Intenta nuevamente.");
    }
    return new Response("OK", { status: 200 });
  }

  // ----------------------------------------------------------
  // MENÚ DE REPORTES
  // ----------------------------------------------------------
  // ----------------------------------------------------------
  // ESTADO IA
  // /ia muestra el estado de la integración sin hacer una llamada
  // a OpenAI y, por tanto, sin gastar tokens.
  // ----------------------------------------------------------
  if (textoNormalizado === "/ia" || textoNormalizado === "ia") {
    await enviarTelegram(env, chatId, estadoIA(env));
    return new Response("OK", { status: 200 });
  }

  if (textoNormalizado === "/ia prueba" || textoNormalizado === "ia prueba") {
    if (!iaEstaActiva(env)) {
      await enviarTelegram(env, chatId, "🧪 PRUEBA IA\n\nIA está inactiva. Pon AI_ENABLED=true para hacer la prueba.");
      return new Response("OK", { status: 200 });
    }

    const pruebaIA = await probarConexionIA(env);
    if (pruebaIA?.estado === "ok") {
      await enviarTelegram(env, chatId, `🧪 PRUEBA IA OK\n\n✅ OpenAI respondió correctamente.\n🤖 Modelo: GPT-5.4 nano\n🔢 ${formatearInfoIA(pruebaIA)}`);
    } else {
      await enviarTelegram(env, chatId, mensajeAvisoIADetallado(pruebaIA));
    }
    return new Response("OK", { status: 200 });
  }

  if (textoNormalizado === "/reportes" || textoNormalizado === "reportes") {
    await enviarTelegram(env, chatId, "📊 REPORTES\n\nElige lo que quieres consultar:", menuReportes());
    return new Response("OK", { status: 200 });
  }

  // ----------------------------------------------------------
  // BORRADO SEGURO DE GASTOS POR DÍA
  // /delete                 -> hoy
  // /delete hoy             -> hoy
  // /delete ayer            -> ayer
  // /delete DD/MM/YYYY
  // /delete YYYY-MM-DD
  // /delete 5 agosto 2026
  // ----------------------------------------------------------
  const comandoDelete = interpretarComandoDelete(textoNormalizado);

  if (comandoDelete?.tipo === "ayuda") {
    await enviarTelegram(
      env,
      chatId,
      "🗑️ BORRAR GASTOS\n\n" +
      "Para borrar todas las compras de un día:\n" +
      "• /delete → hoy\n" +
      "• /delete ayer\n" +
      "• /delete 05/09/2026\n" +
      "• /delete 2026-09-05\n" +
      "• /delete 5 agosto 2026"
    );
    return new Response("OK", { status: 200 });
  }

  if (comandoDelete?.tipo === "confirmar") {
    const fechaBorrar = comandoDelete.fecha;
    const resumenBorrado = await prepararBorradoDia(env, chatId, fechaBorrar);

    if (!resumenBorrado || !resumenBorrado.cantidad) {
      await enviarTelegram(
        env,
        chatId,
        `🗑️ No encontré compras confirmadas para el ${formatearFecha(fechaBorrar)}.`
      );
      return new Response("OK", { status: 200 });
    }

    await enviarTelegram(
      env,
      chatId,
      `⚠️ ¿ESTÁS SEGURO?\n\n` +
      `Voy a borrar TODAS las compras confirmadas del ${formatearFecha(fechaBorrar)}.\n\n` +
      `🧾 Compras: ${resumenBorrado.cantidad}\n` +
      `💰 Total: ${formatearPesosReporte(resumenBorrado.total)}\n\n` +
      `Esta acción no se puede deshacer.`,
      {
        inline_keyboard: [[
          { text: "🗑️ SÍ, BORRAR TODO", callback_data: `del|confirm|${fechaBorrar}` },
          { text: "❌ NO", callback_data: `del|cancel|${fechaBorrar}` }
        ]]
      }
    );
    return new Response("OK", { status: 200 });
  }

  // ----------------------------------------------------------
  // REPORTES V17: comandos mensuales y aliases
  // /hoy
  // /mes | /mes 8 | /mes agosto
  // /mes detallado | /mes detallado 8 | /mes detallado agosto
  // /resumen | /resumen 8 | /resumen agosto
  // /resumen detallado | /resumen detallado 8 | /resumen detallado agosto
  // /detalle | /detalle 8 | /detalle agosto
  // ----------------------------------------------------------
  const comandoReporte = interpretarComandoReporte(textoNormalizado);

  if (comandoReporte?.tipo === "invalido") {
    await enviarTelegram(env, chatId, "⚠️ Mes no válido. Usa, por ejemplo: /mes agosto, /mes 8 o /resumen 8.");
    return new Response("OK", { status: 200 });
  }

  // Antes de ejecutar cualquier reporte, reparamos fechas históricas que
  // hayan quedado almacenadas en formato visible ("9 de agosto",
  // "Dom. 9 de agosto", etc.). Esto permite que gastos antiguos importados
  // desde capturas de bancos que no muestran el año vuelvan a participar
  // correctamente en /mes, /detalle y consultas naturales.
  await normalizarFechasGastosExistentes(env, chatId);

  if (comandoReporte?.tipo === "hoy") {
    await enviarTelegram(env, chatId, await generarResumenHoy(env, chatId));
    return new Response("OK", { status: 200 });
  }

  if (comandoReporte?.tipo === "mes") {
    await enviarTelegram(env, chatId, await generarResumenMes(env, chatId, comandoReporte.periodo));
    return new Response("OK", { status: 200 });
  }

  if (comandoReporte?.tipo === "mes_detallado") {
    const resultadoMesDetallado = await generarResumenMesDetallado(env, chatId, comandoReporte.periodo);
    if (resultadoMesDetallado && resultadoMesDetallado.texto) {
      await enviarTelegram(env, chatId, resultadoMesDetallado.texto, resultadoMesDetallado.replyMarkup || null);
    } else {
      await enviarTelegram(env, chatId, resultadoMesDetallado);
    }
    return new Response("OK", { status: 200 });
  }

  if (comandoReporte?.tipo === "detalle") {
    await enviarTelegram(env, chatId, await generarDetalleMes(env, chatId, comandoReporte.periodo));
    return new Response("OK", { status: 200 });
  }

  // ----------------------------------------------------------
  // CONSULTAS NATURALES DE REPORTES
  // ----------------------------------------------------------
  const consultaNatural = interpretarConsultaNatural(textoNormalizado);
  if (consultaNatural) {
    if (consultaNatural.tipo === "dia") {
      await enviarTelegram(env, chatId, await generarDetalleDia(env, chatId, consultaNatural.fecha));
      return new Response("OK", { status: 200 });
    }
    if (consultaNatural === "buscar") {
      const respuestaBusqueda = await buscarGastoReporte(env, chatId, text);
      await enviarTelegram(env, chatId, respuestaBusqueda);
      return new Response("OK", { status: 200 });
    }

    if (consultaNatural && consultaNatural.tipo === "generica") {
      const resultadoGenerico = await ejecutarConsultaGenerica(env, chatId, consultaNatural.sujeto, fechaLocalISO().slice(0, 7), nombreMes(Number(fechaLocalISO().slice(5, 7))), fechaLocalISO().slice(0, 4));
      if (resultadoGenerico && resultadoGenerico.texto) {
        await enviarTelegram(env, chatId, resultadoGenerico.texto, resultadoGenerico.replyMarkup || null);
      } else {
        await enviarTelegram(env, chatId, resultadoGenerico);
      }
      return new Response("OK", { status: 200 });
    }

    const respuestaConsulta = await ejecutarConsultaReporte(env, chatId, consultaNatural);
    if (respuestaConsulta && respuestaConsulta.texto) {
      await enviarTelegram(env, chatId, respuestaConsulta.texto, respuestaConsulta.replyMarkup || null);
    } else {
      await enviarTelegram(env, chatId, respuestaConsulta);
    }
    return new Response("OK", { status: 200 });
  }

  // ----------------------------------------------------------
  // FALLBACK IA PARA CONSULTAS NATURALES
  // El motor básico siempre tiene prioridad. Si no entendió el mensaje,
  // la IA puede interpretar lenguaje natural y devolver una consulta
  // estructurada que este Worker ejecuta sobre D1.
  // ----------------------------------------------------------
  if (iaEstaActiva(env) && pareceConsultaIA(textoNormalizado, text)) {
    const respuestaIA = await interpretarConsultaConIA(env, text);

    if (respuestaIA?.estado === "ok" && respuestaIA.consulta?.intencion && respuestaIA.consulta.intencion !== "NO_CONSULTA") {
      const resultadoIA = await ejecutarConsultaIA(env, chatId, respuestaIA.consulta, text);
      const pieIA = formatearInfoIA(respuestaIA);

      if (resultadoIA && resultadoIA.texto) {
        await enviarTelegram(env, chatId, `${resultadoIA.texto}\n\n${pieIA}`, resultadoIA.replyMarkup || null);
      } else {
        await enviarTelegram(env, chatId, `${resultadoIA}\n\n${pieIA}`);
      }
      return new Response("OK", { status: 200 });
    }

    if (respuestaIA?.estado === "error") {
      await enviarTelegram(env, chatId, mensajeAvisoIA(respuestaIA));
    }
  }

  // ----------------------------------------------------------
  // INICIO / AYUDA / SALUDOS
  // ----------------------------------------------------------

  if (textoNormalizado === "/start" || textoNormalizado === "start") {
    await enviarTelegram(env, chatId, `Hola ${firstName || ""} 👋

Soy Gastos IA.

Puedes escribirme tus gastos de forma natural.

Por ejemplo:
• "Hoy compré mercado en 380 mil"
• "Anoche salí a comer con mi esposa y gasté 300 mil"
• "Hoy pagué Netflix 45 mil"

También puedo pedirte el valor si mencionas una compra sin monto.

Cuando te muestre un gasto, tendrás botones para:
• ✅ SI, guardar
• ✏️ CORREGIR\n\nTambién puedes consultar tus gastos desde Reportes 👇`, await menuInicio(env, chatId));
    return new Response("OK", { status: 200 });
  }

  if (esSaludo(textoNormalizado)) {
    await enviarTelegram(
      env,
      chatId,
      `👋 Hola${firstName ? " " + firstName : ""}.\n\nSoy Gastos IA. Escríbeme un gasto y yo lo organizo. Por ejemplo: "hoy compré mercado 200.000".\n\nTambién puedes consultar tus gastos desde Reportes 👇`,
      await menuInicio(env, chatId)
    );
    return new Response("OK", { status: 200 });
  }

  if (esSolicitudAyuda(textoNormalizado)) {
    await enviarTelegram(
      env,
      chatId,
      `ℹ️ Puedo registrar tus gastos escritos de forma natural.

Ejemplo:
"ayer compré medicamentos en Farmatodo por 180.000 con TC"

Primero te muestro cómo lo entendí y tendrás botones para:
✅ SI, guardar
✏️ CORREGIR`);
    return new Response("OK", { status: 200 });
  }

  // ----------------------------------------------------------
  // CORREGIR = CATEGORÍA / DATOS
  // ----------------------------------------------------------

  if (textoNormalizado === "corregir" || textoNormalizado === "correccion" || textoNormalizado === "corrección") {
    const pendiente = await obtenerPendienteActivo(env, chatId);

    if (!pendiente) {
      await enviarTelegram(
        env,
        chatId,
        "ℹ️ No tienes un gasto pendiente de confirmación para corregir."
      );
      return new Response("OK", { status: 200 });
    }

    try {
      const interpretacion = JSON.parse(pendiente.interpretacion_json);

      if ((interpretacion.movimientos || []).length > 1) {
        await enviarTelegram(
          env,
          chatId,
          "✏️ ¿Qué movimiento quieres corregir?",
          crearTecladoMovimientos(interpretacion.movimientos, pendiente.id)
        );
      } else {
        await enviarTelegram(
          env,
          chatId,
          "✏️ Vamos a corregir solo la categoría o subcategoría.\n\nEl monto, fecha, comercio, persona y forma de pago se mantienen iguales.\n\nSelecciona la categoría:",
          await crearTecladoCategorias(env, pendiente.id)
        );
      }

      try {
        await marcarPendienteCorrigiendo(env, pendiente.id);
      } catch (error) {
        console.log("NO SE PUDO MARCAR CORRECCION; MENU YA ENVIADO", error);
      }
    } catch (error) {
      console.log("ERROR INICIANDO CORRECCION", error);
      await enviarTelegram(env, chatId, "⚠️ No pude iniciar la corrección. Intenta nuevamente.");
    }

    return new Response("OK", { status: 200 });
  }

  // ----------------------------------------------------------
  // CORRECCIÓN ESCRITA / SALIR DE CORRECCIÓN
  // ----------------------------------------------------------

  let pendienteCorrigiendo = await obtenerPendienteCorrigiendo(env, chatId);

  if (pendienteCorrigiendo) {
    // Cuando estamos específicamente en CORREGIR DATOS, el siguiente
    // mensaje de gasto pertenece a la corrección y NO debe crear otro
    // pendiente ni reemplazar el actual.
    if (pendienteCorrigiendo.estado === "corrigiendo_datos") {
      if (["cancelar", "salir"].includes(textoNormalizado)) {
        await actualizarEstadoPendiente(env, pendienteCorrigiendo.id, "pendiente");
        await enviarTelegram(env, chatId, "↩️ Corrección cancelada. El gasto original sigue pendiente de confirmación.", botonesPendiente(pendienteCorrigiendo.id));
        return new Response("OK", { status: 200 });
      }

      if (["corregir", "correccion", "corrección"].includes(textoNormalizado)) {
        await enviarTelegram(
          env,
          chatId,
          "📝 Escribe nuevamente el gasto con el dato corregido.",
          { inline_keyboard: [[{ text: "↩️ Volver", callback_data: `corr_back|${pendienteCorrigiendo.id}` }]] }
        );
        return new Response("OK", { status: 200 });
      }

      if (!esPosibleGasto(textoNormalizado)) {
        await enviarTelegram(
          env,
          chatId,
          "⚠️ No pude interpretar ese gasto.\n\n📝 Escríbelo nuevamente con el dato corregido.",
          { inline_keyboard: [[{ text: "↩️ Volver", callback_data: `corr_back|${pendienteCorrigiendo.id}` }]] }
        );
        return new Response("OK", { status: 200 });
      }

      try {
        const anterior = JSON.parse(pendienteCorrigiendo.interpretacion_json || "{}");
        let nuevaInterpretacion = interpretarGasto(text);
        nuevaInterpretacion = await aplicarAprendizajes(env, chatId, nuevaInterpretacion);

        nuevaInterpretacion._correccion = {
          tipo: "correccion_datos",
          mensaje_original: pendienteCorrigiendo.mensaje_original,
          mensaje_corregido: text,
          interpretacion_anterior: {
            monto: anterior.monto ?? null,
            fecha: anterior.fecha ?? null,
            movimientos: anterior.movimientos || []
          }
        };
        nuevaInterpretacion.mensaje_original = pendienteCorrigiendo.mensaje_original;

        await actualizarPendienteInterpretacion(env, pendienteCorrigiendo.id, nuevaInterpretacion);

        const respuesta = crearRespuestaGasto(nuevaInterpretacion);
        const botones = (nuevaInterpretacion.monto !== null && nuevaInterpretacion.estado !== "requiere_revision")
          ? botonesPendiente(pendienteCorrigiendo.id)
          : { inline_keyboard: [[{ text: "↩️ Volver", callback_data: `corr_back|${pendienteCorrigiendo.id}` }]] };

        await enviarTelegram(env, chatId, respuesta, botones);
      } catch (error) {
        console.log("ERROR CORRIGIENDO DATOS", error?.stack || error);
        await enviarTelegram(
          env,
          chatId,
          "⚠️ No pude actualizar los datos del gasto.\n\n📝 Escríbelo nuevamente con el dato corregido.",
          { inline_keyboard: [[{ text: "↩️ Volver", callback_data: `corr_back|${pendienteCorrigiendo.id}` }]] }
        );
      }
      return new Response("OK", { status: 200 });
    }

    // Si llega un nuevo gasto mientras corregimos categoría, sí se considera
    // un gasto nuevo y reemplaza el pendiente anterior.
    if (esPosibleGasto(textoNormalizado)) {
      await actualizarEstadoPendiente(env, pendienteCorrigiendo.id, "reemplazado");
      pendienteCorrigiendo = null;
    }
  }

  if (pendienteCorrigiendo) {
    if (["cancelar", "salir", "volver"].includes(textoNormalizado)) {
      await actualizarEstadoPendiente(env, pendienteCorrigiendo.id, "pendiente");
      await enviarTelegram(env, chatId, "↩️ Corrección cancelada. El gasto original sigue pendiente de confirmación.", botonesPendiente(pendienteCorrigiendo.id));
      return new Response("OK", { status: 200 });
    }

    // Si escribe CORREGIR otra vez, simplemente volvemos a mostrar las opciones.
    if (["corregir", "correccion", "corrección"].includes(textoNormalizado)) {
      await enviarTelegram(
        env,
        chatId,
        "✏️ ¿Qué quieres corregir?",
        crearTecladoTipoCorreccion(pendienteCorrigiendo.id)
      );
      return new Response("OK", { status: 200 });
    }

    const correccion = await interpretarCorreccionCategoriaDesdeCatalogo(env, text);

    if (!correccion) {
      await enviarTelegram(
        env,
        chatId,
        "⚠️ No pude identificar la categoría o subcategoría.\n\nPuedes elegirla con los botones o escribir, por ejemplo:\n• \"debe quedar en mercado\"\n• \"debe quedar en Personal\"\n• \"debe quedar en Otras suscripciones\"\n\nSi quieres abandonar la corrección, escribe CANCELAR."
      );
      return new Response("OK", { status: 200 });
    }

    // Si escribió una categoría (ej. "debe quedar en Personal"), todavía
    // falta escoger la subcategoría. Mostramos solo sus subcategorías.
    if (correccion.tipo === "categoria") {
      const interpretacion = JSON.parse(pendienteCorrigiendo.interpretacion_json);
      const contexto = interpretacion._correccion_contexto || {};
      interpretacion._correccion_contexto = {
        ...contexto,
        categoria_id: correccion.categoria.id,
        categoria_nombre: correccion.categoria.nombre
      };
      await marcarPendienteCorrigiendoConInterpretacion(env, pendienteCorrigiendo.id, interpretacion);
      await enviarTelegram(
        env,
        chatId,
        `📂 ${correccion.categoria.nombre}\n\nAhora selecciona la subcategoría:`,
        await crearTecladoSubcategorias(env, pendienteCorrigiendo.id, correccion.categoria.id)
      );
      return new Response("OK", { status: 200 });
    }

    const interpretacion = JSON.parse(pendienteCorrigiendo.interpretacion_json);
    const contexto = interpretacion._correccion_contexto || {};
    const indice = Number.isInteger(contexto.movimiento_index) ? contexto.movimiento_index : 0;
    await aplicarCorreccionCatalogo(env, pendienteCorrigiendo.id, interpretacion, indice, correccion);

    await enviarTelegram(
      env,
      chatId,
      crearRespuestaGasto(interpretacion) +
        `\n\n✏️ Clasificación corregida a:\n📂 ${correccion.categoria.nombre} → ${correccion.subcategoria.nombre}\n\nResponde SI para guardar el gasto y conservar esta corrección como aprendizaje.`,
      { inline_keyboard: [[
        { text: "✅ SI, guardar", callback_data: `confirm|${pendienteCorrigiendo.id}` },
        { text: "↩️ Volver", callback_data: `corr_back|${pendienteCorrigiendo.id}` }
      ]] }
    );
    return new Response("OK", { status: 200 });
  }

  // ----------------------------------------------------------
  // SI = CONFIRMAR EL ÚLTIMO GASTO PENDIENTE
  // ----------------------------------------------------------

  if (
    textoNormalizado === "si" ||
    textoNormalizado === "sí" ||
    textoNormalizado === "confirmar" ||
    textoNormalizado === "confirmado"
  ) {
    const pendiente = await obtenerPendienteActivo(env, chatId);

    if (!pendiente) {
      await enviarTelegram(
        env,
        chatId,
        "ℹ️ No tienes un gasto pendiente para confirmar."
      );
      return new Response("OK", { status: 200 });
    }

    try {
      const resultado = JSON.parse(pendiente.interpretacion_json);

      if (
        resultado.monto === null ||
        resultado.estado === "requiere_revision"
      ) {
        await enviarTelegram(
          env,
          chatId,
          "⚠️ Este gasto todavía tiene información pendiente. Envíame nuevamente el gasto completo con el dato que falta."
        );
        return new Response("OK", { status: 200 });
      }

      const gastoId = await guardarGastoConfirmado(env, chatId, resultado);

      await marcarPendienteConfirmado(env, pendiente.id);

      // Solo después de confirmar guardamos el aprendizaje.
      await guardarAprendizajeSiExiste(
        env,
        chatId,
        pendiente,
        resultado
      );

      await enviarTelegram(
        env,
        chatId,
        `✅ Gasto guardado correctamente.

💰 ${formatearPesos(resultado.monto)}
📅 ${formatearFecha(resultado.fecha)}
`
      );
    } catch (error) {
      console.log("ERROR GUARDANDO GASTO", error);
      await enviarTelegram(
        env,
        chatId,
        "⚠️ Ocurrió un error al guardar el gasto. No se confirmó para evitar duplicarlo."
      );
    }

    return new Response("OK", { status: 200 });
  }

  // ----------------------------------------------------------
  // UN NUEVO MENSAJE DE GASTO SIEMPRE CREA UNA NUEVA INTERPRETACIÓN
  // La corrección de datos reutiliza el mismo pendiente y reemplaza su interpretación antes de guardar.
  // ----------------------------------------------------------

  if (!esPosibleGasto(textoNormalizado)) {
    await enviarTelegram(
      env,
      chatId,
      `🤔 No entendí esto como un gasto.

Si quieres registrar algo, escríbeme por ejemplo:
"compré medicamentos en Farmatodo 180.000"
o
"compré una hidrolavadora en MercadoLibre"`
    );
    return new Response("OK", { status: 200 });
  }

  // ----------------------------------------------------------
  // INTERPRETAR GASTO
  // ----------------------------------------------------------

  let resultado = interpretarGasto(text);

  // Consulta los aprendizajes confirmados antes de mostrar el resultado.
  resultado = await aplicarAprendizajes(env, chatId, resultado);

  console.log("RESULTADO INTERPRETACIÓN");
  console.log(JSON.stringify(resultado));

  const pendingId = crypto.randomUUID();

  const posibleDuplicado = await buscarPosibleDuplicado(env, chatId, resultado, text);

  await guardarPendiente(
    env,
    pendingId,
    chatId,
    text,
    resultado
  );

  const respuesta = crearRespuestaGasto(resultado);

  // Si el gasto está listo para confirmar, mostramos botones reales de Telegram.
  // Así el usuario no tiene que escribir SI ni CORREGIR.
  let botonesConfirmacion = null;
  if (resultado.monto !== null && resultado.estado !== "requiere_revision") {
    if (posibleDuplicado) {
      botonesConfirmacion = {
        inline_keyboard: [
          [{ text: "✅ GUARDAR DE TODAS FORMAS", callback_data: `dup_save|${pendingId}` }],
          [{ text: "❌ NO GUARDAR", callback_data: `dup_cancel|${pendingId}` }]
        ]
      };
      const coincidencias = Array.isArray(posibleDuplicado.coincidencias) ? posibleDuplicado.coincidencias : [];
      let alerta = `⚠️ POSIBLE GASTO REPETIDO\n\n` +
        `Encontré ${coincidencias.length} gasto${coincidencias.length === 1 ? "" : "s"} ya guardado${coincidencias.length === 1 ? "" : "s"} con la MISMA FECHA y el MISMO VALOR.\n` +
        `La descripción puede ser diferente y aun así se genera la alerta.\n\n` +
        `🆕 Gasto que quieres registrar\n` +
        `💰 ${formatearPesos(resultado.monto)}\n` +
        `📅 ${formatearFecha(resultado.fecha)}\n` +
        `📝 ${capitalizar(resultado.movimientos?.[0]?.concepto || "Gasto")}\n`;

      if (coincidencias.length) {
        alerta += `\n💾 Ya existente en la base de datos:\n`;
        coincidencias.slice(0, 5).forEach((d, idx) => {
          alerta += `\n${idx + 1}. 📅 ${formatearFecha(d.fecha)} · 💰 ${formatearPesos(d.monto)}\n`;
          alerta += `   🏪 ${d.comercio || "Comercio no identificado"}\n`;
          alerta += `   📝 ${d.concepto || d.detalle || "Sin descripción"}\n`;
          if (d.categoria || d.subcategoria) {
            alerta += `   📂 ${d.categoria || ""}${d.subcategoria ? ` → ${d.subcategoria}` : ""}\n`;
          }
        });
      }

      alerta += `\n⚠️ Puede ser un gasto legítimo diferente. Tú decides qué hacer.`;

      await enviarTelegram(env, chatId, alerta, botonesConfirmacion);
      return new Response("OK", { status: 200 });
    }

    botonesConfirmacion = {
      inline_keyboard: [[
        { text: "✅ SI, guardar", callback_data: `confirm|${pendingId}` },
        { text: "✏️ CORREGIR", callback_data: `correct|${pendingId}` }
      ]]
    };
  }

  await enviarTelegram(env, chatId, respuesta, botonesConfirmacion);

  return new Response("OK", { status: 200 });
}

// ============================================================
// V63
// IMPORTACIÓN DE EXCEL BANCARIO DETERMINISTA
// ============================================================
// El Excel se trata como otra fuente de movimientos bancarios.
// No se guarda nada directamente: primero se convierten los negativos
// en pendientes y cada uno pasa por el mismo flujo de revisión de foto.
// Los positivos/abonos se ignoran.
// ============================================================

function esDocumentoExcelTelegram(message) {
  const doc = message?.document;
  if (!doc?.file_id) return false;

  const nombre = String(doc.file_name || "").toLowerCase().trim();
  const mime = String(doc.mime_type || "").toLowerCase();

  return (
    /\.xlsx?$/.test(nombre) ||
    mime === "application/vnd.ms-excel" ||
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/excel" ||
    mime === "application/xls"
  );
}

async function descargarDocumentoTelegram(env, fileId) {
  const fileResponse = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`
  );
  const fileData = await fileResponse.json();

  if (!fileResponse.ok || !fileData?.ok || !fileData?.result?.file_path) {
    throw new Error(fileData?.description || "No pude obtener el archivo desde Telegram");
  }

  const filePath = fileData.result.file_path;
  const documentResponse = await fetch(
    `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`
  );

  if (!documentResponse.ok) {
    throw new Error(`No pude descargar el Excel: HTTP ${documentResponse.status}`);
  }

  return {
    filePath,
    bytes: new Uint8Array(await documentResponse.arrayBuffer())
  };
}

function normalizarCabeceraExcel(valor) {
  return String(valor ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

function buscarColumnaExcel(headers, patrones) {
  for (let i = 0; i < headers.length; i++) {
    const h = normalizarCabeceraExcel(headers[i]);
    if (patrones.some(p => p.test(h))) return i;
  }
  return -1;
}

function fechaExcelAVISO(valor) {
  if (valor === null || valor === undefined || valor === "") return null;

  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    const partes = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(valor);
    const get = t => partes.find(x => x.type === t)?.value;
    const iso = `${get("year")}-${get("month")}-${get("day")}`;
    return fechaISOValida(iso) ? iso : null;
  }

  const texto = String(valor).trim();
  const normalizada = normalizarFechaRegistro(texto);
  if (normalizada) return normalizada;

  // Excel puede entregar la fecha como número serial cuando cellDates no
  // convierte automáticamente la celda. SheetJS usa el sistema 1900 por defecto.
  const n = Number(texto);
  if (Number.isFinite(n) && n > 1 && n < 100000) {
    try {
      const d = XLSX.SSF.parse_date_code(n);
      if (d?.y && d?.m && d?.d) {
        const iso = `${String(d.y).padStart(4,"0")}-${String(d.m).padStart(2,"0")}-${String(d.d).padStart(2,"0")}`;
        return fechaISOValida(iso) ? iso : null;
      }
    } catch (_) {}
  }
  return null;
}

function extraerFechaOperacionExcel(descripcion, fechaFila) {
  // La fecha estructurada de la columna Fecha es la única fecha válida para
  // el registro. La descripción puede contener fechas, pero son solo texto
  // bancario y NUNCA deben cambiar la fecha del gasto.
  return fechaFila;
}

function valorExcelNumero(valor) {
  if (typeof valor === "number" && Number.isFinite(valor)) return valor;
  if (valor === null || valor === undefined || valor === "") return null;

  let s = String(valor).trim().replace(/\s/g, "").replace(/[$€£]/g, "");
  if (!s) return null;

  const negativo = /^-/.test(s) || /^\(.*\)$/.test(s);
  s = s.replace(/^[+-]/, "").replace(/^\((.*)\)$/, "$1");

  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return negativo ? -n : n;
  }

  // Para texto monetario: si hay punto y coma, asumimos el último separador
  // como decimal; si solo hay coma/punto repetido, se interpreta como miles.
  if (s.includes(",") && s.includes(".")) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (s.includes(",")) {
    const partes = s.split(",");
    s = partes.length === 2 && partes[1].length !== 3
      ? `${partes[0].replace(/\./g, "")}.${partes[1]}`
      : s.replace(/,/g, "");
  } else if (s.includes(".")) {
    const partes = s.split(".");
    s = partes.length === 2 && partes[1].length !== 3
      ? s
      : s.replace(/\./g, "");
  }

  const n = Number(s);
  return Number.isFinite(n) ? (negativo ? -n : n) : null;
}

function encontrarFilaEncabezadosExcel(rows) {
  const limite = Math.min(rows.length, 30);
  for (let r = 0; r < limite; r++) {
    const headers = rows[r] || [];
    const fecha = buscarColumnaExcel(headers, [/^fecha$/, /fecha/]);
    const descripcion = buscarColumnaExcel(headers, [/descripcion/, /concepto/, /detalle/, /movimiento/]);
    const valor = buscarColumnaExcel(headers, [/^valor$/, /valor/, /monto/, /importe/]);
    if (fecha >= 0 && descripcion >= 0 && valor >= 0) {
      return { fila: r, fecha, descripcion, valor };
    }
  }
  return null;
}

function leerExcelBancarioDeterminista(bytes) {
  const workbook = XLSX.read(bytes, {
    type: "array",
    cellDates: true,
    cellNF: false,
    cellText: true,
    raw: true
  });

  const movimientosNegativos = [];
  let positivosIgnorados = 0;
  let filasInvalidas = 0;
  const clavesFilas = new Set();

  for (const nombreHoja of workbook.SheetNames) {
    const hoja = workbook.Sheets[nombreHoja];
    const rows = XLSX.utils.sheet_to_json(hoja, { header: 1, raw: true, defval: "", blankrows: false });
    const cab = encontrarFilaEncabezadosExcel(rows);
    if (!cab) continue;

    for (let r = cab.fila + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const fechaFila = fechaExcelAVISO(row[cab.fecha]);
      const descripcion = String(row[cab.descripcion] ?? "").trim();
      const valorOriginal = row[cab.valor];
      const valor = valorExcelNumero(valorOriginal);

      // Ignorar filas totalmente vacías después del encabezado.
      if (!fechaFila && !descripcion && (valor === null || valor === undefined)) continue;

      if (valor === null || !Number.isFinite(valor) || !fechaFila || !descripcion) {
        filasInvalidas++;
        continue;
      }

      if (valor > 0) {
        positivosIgnorados++;
        continue;
      }
      if (valor === 0) continue;

      const claveFila = `${nombreHoja}|${r + 1}`;
      if (clavesFilas.has(claveFila)) continue;
      clavesFilas.add(claveFila);

      const fechaOperacion = extraerFechaOperacionExcel(descripcion, fechaFila);

      // El VALOR de esta fila es la única fuente del monto. La descripción
      // jamás se vuelve a interpretar como una lista de gastos.
      movimientosNegativos.push({
        fecha: fechaOperacion,
        monto: Math.abs(valor),
        comercio: extraerComercioDesdeDescripcionBancaria(descripcion),
        descripcion_banco: descripcion,
        hoja: nombreHoja,
        fila: r + 1
      });
    }
  }

  return {
    movimientos_negativos: movimientosNegativos,
    positivos_ignorados: positivosIgnorados,
    filas_invalidas: filasInvalidas,
    hojas_revisadas: workbook.SheetNames.length
  };
}

function extraerComercioDesdeDescripcionBancaria(descripcion) {
  const t = String(descripcion || "").trim();
  if (!t) return null;

  let m = t.match(/Compra en establecimiento\s+(.+?)(?:\s+efectuada\s+el\s+|\s+realizada\s+el\s+|\s+Tarj\s+#|$)/i);
  if (m) return m[1].trim();

  m = t.match(/Pago PSE en establecimiento\s+(.+?)(?:\s+efectuado\s+el\s+|\s+realizado\s+el\s+|$)/i);
  if (m) return m[1].trim();

  m = t.match(/(?:Enviaste|Pagaste)\s+(?:por llave\s+)?(?:a\s+)?(.+?)(?:\s+a la llave\s+|\s+de\s+[A-Z]|\s+-\s+(?:NEQUI|BANCOLOMBIA)|\s+el\s+\d{2}\/\d{2}\/\d{4}|$)/i);
  if (m) return m[1].trim();

  return null;
}

async function procesarExcelMovimientosTelegram(env, chatId, message) {
  const document = message?.document;
  const fileId = document?.file_id;
  if (!fileId) throw new Error("El documento no tiene file_id");

  const nombreArchivo = String(document?.file_name || "movimientos.xlsx");
  const descargado = await descargarDocumentoTelegram(env, fileId);

  // Desde V63 el Excel se interpreta de forma DETERMINISTA con SheetJS.
  // Esto elimina el riesgo de que la IA confunda números de la descripción
  // (teléfonos, tarjetas, NIT, referencias) con el valor de la transacción.
  const resultado = leerExcelBancarioDeterminista(descargado.bytes);

  let texto = `📊 LECTURA DE EXCEL BANCARIO\n\n`;
  texto += `🔎 Movimientos negativos encontrados: ${resultado.movimientos_negativos.length}\n`;
  texto += `🚫 Positivos/abonos ignorados: ${resultado.positivos_ignorados}\n`;
  if (resultado.filas_invalidas) texto += `⚠️ Filas inválidas/no legibles: ${resultado.filas_invalidas}\n`;
  texto += `📑 Hojas revisadas: ${resultado.hojas_revisadas}\n\n`;
  texto += `ℹ️ Cada fila negativa genera UN SOLO pendiente. El valor sale exclusivamente de la columna Valor; la descripción nunca genera montos adicionales.\n`;
  texto += `ℹ️ Los negativos pasan a validación uno por uno. Nada se guarda directamente.`;

  return {
    texto,
    resultado,
    usage: null,
    fileId
  };
}

async function crearPendientesDesdeExcel(env, chatId, message, resultadoExcel) {
  const movimientos = Array.isArray(resultadoExcel?.resultado?.movimientos_negativos)
    ? resultadoExcel.resultado.movimientos_negativos
    : [];

  const document = message?.document;
  const fileId = document?.file_id || crypto.randomUUID();
  let creados = 0;
  let omitidosInvalidos = 0;
  let posiblesRepetidos = 0;
  let coincidenciasConfirmadas = 0;
  let coincidenciasPendientes = 0;

  for (let i = 0; i < movimientos.length; i++) {
    const m = movimientos[i] || {};
    const monto = Number(m.monto || 0);
    const fechaNormalizada = normalizarFechaRegistro(m.fecha);
    const descripcionBanco = String(m.descripcion_banco || "").trim();

    if (!monto || !fechaNormalizada || !descripcionBanco) {
      omitidosInvalidos++;
      continue;
    }

    const comercioDetectado = String(m.comercio || "").trim();
    const textoClasificacion = [comercioDetectado, descripcionBanco].filter(Boolean).join(" ").trim();

    // CRÍTICO: para Excel NO llamamos interpretarGasto(), porque esa función
    // está diseñada para texto libre y puede interpretar números de la
    // descripción como montos. El Excel ya tiene una columna Valor autoritativa.
    // Solo clasificamos el texto, sin extraer movimientos ni números.
    const clasificacion = clasificarCategoria(textoClasificacion);

    const item = {
      concepto: comercioDetectado ? `Compra en ${comercioDetectado}` : descripcionBanco,
      detalle: descripcionBanco,
      monto,
      cantidad: null,
      comercio: comercioDetectado || null,
      forma_pago: null,
      persona: null,
      categoria: clasificacion.categoria,
      subcategoria: clasificacion.subcategoria,
      confianza: clasificacion.confianza
    };

    let resultado = {
      tipo: "gasto",
      mensaje_original: `[EXCEL_BANCO:${fileId}:${i}] ${descripcionBanco}`,
      monto,
      moneda: "COP",
      fecha: fechaNormalizada,
      comercio: comercioDetectado || null,
      forma_pago: null,
      persona: null,
      periodicidad: null,
      movimientos: [item],
      categoria: item.categoria,
      subcategoria: item.subcategoria,
      confianza_categoria: item.confianza,
      estado: "pendiente",
      banco_perfil: "Excel bancario",
      formato_monetario: "EXCEL",
      _fuente: "excel_banco",
      _telegram_file_id: fileId,
      _excel_movimiento_index: i,
      _excel_hoja: m.hoja || null,
      _excel_fila: m.fila || null,
      _descripcion_banco: descripcionBanco,
      _descripcion_usuario: ""
    };

    resultado = await aplicarAprendizajes(env, chatId, resultado);

    // Defensa adicional: un Excel siempre representa UNA fila = UN gasto.
    // Los aprendizajes solo pueden cambiar categoría/subcategoría, nunca crear
    // movimientos adicionales ni alterar fecha/monto.
    resultado.movimientos = [item];
    resultado.monto = monto;
    resultado.fecha = fechaNormalizada;
    resultado.categoria = item.categoria;
    resultado.subcategoria = item.subcategoria;
    resultado.confianza_categoria = item.confianza;

    const posibleDuplicado = await buscarPosibleDuplicadoFoto(env, chatId, resultado, fileId);
    if (posibleDuplicado) {
      resultado._posible_duplicado = true;
      resultado._duplicado_tipo = posibleDuplicado.tipo;
      resultado._duplicado_cantidad = posibleDuplicado.cantidad;
      resultado._duplicado_confirmados = posibleDuplicado.cantidadConfirmados;
      resultado._duplicado_pendientes = posibleDuplicado.cantidadPendientes;
      resultado._duplicado_ejemplo = posibleDuplicado.ejemplo;
      resultado._duplicados_detalle = posibleDuplicado.coincidencias || [];
      posiblesRepetidos++;
      coincidenciasConfirmadas += posibleDuplicado.cantidadConfirmados;
      coincidenciasPendientes += posibleDuplicado.cantidadPendientes;
    } else {
      resultado._posible_duplicado = false;
    }

    await guardarPendiente(
      env,
      crypto.randomUUID(),
      chatId,
      resultado.mensaje_original,
      resultado,
      false,
      "foto_pendiente"
    );
    creados++;
  }

  const totalPendientes = await contarPendientesFoto(env, chatId);
  let texto = `📥 PROCESAMIENTO DE EXCEL\n\n`;
  texto += `🔎 Movimientos negativos detectados: ${movimientos.length}\n`;
  texto += `📥 Nuevos pendientes creados: ${creados}\n`;
  if (posiblesRepetidos) {
    texto += `⚠️ Con coincidencia existente: ${posiblesRepetidos}\n`;
    texto += `   • Gastos ya guardados coincidentes: ${coincidenciasConfirmadas}\n`;
    texto += `   • Pendientes coincidentes: ${coincidenciasPendientes}\n`;
  }
  if (omitidosInvalidos) texto += `⏭️ Omitidos por datos inválidos: ${omitidosInvalidos}\n`;
  texto += `\n📥 Total pendientes por validar: ${totalPendientes}`;
  texto += `\n\nℹ️ En Excel: 1 fila negativa = 1 pendiente. La columna Valor manda sobre cualquier número de la descripción.`;

  const siguiente = await obtenerSiguientePendienteFoto(env, chatId);
  return {
    texto,
    replyMarkup: siguiente
      ? { inline_keyboard: [[{ text: "📥 REVISAR PENDIENTES", callback_data: "foto|menu" }]] }
      : null
  };
}

// ============================================================
// V63
// ============================================================
// FASE 1 - IA PARA LEER FOTOS DE MOVIMIENTOS BANCARIOS
// No guarda nada en D1. Solo extrae movimientos y los reporta.
// ============================================================


function esMontoFalsoPorTextoBancario(movimiento) {
  const montoTexto = String(movimiento?.monto_texto || "").trim();
  const digitosMonto = montoTexto.replace(/\D/g, "");
  if (digitosMonto.length < 4) return false;

  const texto = `${movimiento?.comercio || ""} ${movimiento?.descripcion_banco || ""}`;
  const compacto = texto.replace(/\D/g, "");
  if (!compacto.includes(digitosMonto)) return false;

  const t = normalizar(texto);

  // Llaves, teléfonos, referencias y números de tarjeta nunca son el monto
  // principal de la fila. Esto evita casos como 3135430535 y 457603/1735.
  if (/(llave|telefono|celular|nequi|tarj|tarjeta|nit|referencia|ref\b)/i.test(t)) return true;

  // Si el número aparece dentro del comercio/descripción pero no existe una
  // señal monetaria junto a él, es muy probable que sea un código y no el monto.
  if (new RegExp(`(?:^|\\D)${digitosMonto}(?:\\D|$)`).test(texto) && !new RegExp(`(?:\\$|cop|valor|monto)\\s*[^0-9]{0,4}${digitosMonto}`, "i").test(texto)) {
    return true;
  }

  return false;
}

async function procesarFotoMovimientosTelegram(env, chatId, message) {
  if (!env.OPENAI_API_KEY) {
    return {
      texto: "⚠️ No puedo analizar fotos porque OPENAI_API_KEY no está configurada."
    };
  }

  const fotos = Array.isArray(message?.photo) ? message.photo : [];
  if (!fotos.length) {
    return { texto: "⚠️ No encontré una foto para analizar." };
  }

  const foto = fotos[fotos.length - 1];
  const fileId = foto?.file_id;
  if (!fileId) throw new Error("La foto no tiene file_id");

  const fileResponse = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`
  );
  const fileData = await fileResponse.json();
  if (!fileResponse.ok || !fileData?.ok || !fileData?.result?.file_path) {
    throw new Error(fileData?.description || "No pude obtener la foto desde Telegram");
  }

  const filePath = fileData.result.file_path;
  const imageResponse = await fetch(
    `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`
  );
  if (!imageResponse.ok) {
    throw new Error(`No pude descargar la foto: HTTP ${imageResponse.status}`);
  }

  const imageBytes = new Uint8Array(await imageResponse.arrayBuffer());
  const base64 = bytesToBase64(imageBytes);
  const mime = detectarMimeImagen(filePath);

  const hoy = fechaLocalISO();
  const captionUsuario = String(message?.caption || "").trim();
  const bancoForzado = detectarBancoPorCaption(captionUsuario);
  const pistaBanco = bancoForzado
    ? `El usuario indicó explícitamente el banco: ${bancoForzado.nombre}. Usa este perfil monetario con prioridad: ${bancoForzado.formato}.`
    : `No hay banco indicado por el usuario. Intenta identificar el banco por la interfaz/logotipo visible y devuelve el nombre solo si tienes evidencia suficiente.`;
  const prompt = `Analiza esta captura de pantalla de movimientos bancarios.

${pistaBanco}

Objetivo: identificar únicamente movimientos que representen GASTOS/COMPRAS para una aplicación personal de gastos.

REGLAS MUY IMPORTANTES:
1. Los movimientos positivos (+) son ingresos/abonos y DEBEN quedar fuera de los gastos.
2. TODO movimiento negativo (-) debe incluirse como pendiente para revisión, aunque el texto diga transferencia, envío por llave, pago, compra u otra operación.
3. Los movimientos positivos (+) son los únicos que deben quedar fuera. No descartes un movimiento negativo por su descripción: el usuario decidirá después si lo guarda o lo deniega.
4. Lee la fecha que aparece asociada a cada movimiento. No uses la fecha actual salvo que la captura realmente la muestre.
5. El campo monto_texto debe contener EXACTAMENTE el valor monetario visible en la pantalla, sin el signo negativo y conservando los separadores tal como aparecen. NO conviertas el monto a decimal y NO cambies puntos por comas ni comas por puntos.
6. Identifica, si es posible, el banco visible en la captura. Si el usuario indicó el banco en el texto de la foto, ese dato tiene prioridad.
7. Indica formato_monetario: "PUNTO_MILES" para formatos como "$183.770" o "$183.770,00"; "COMA_MILES" para formatos como "$20,900" o "$20,900.00"; "DESCONOCIDO" si no hay evidencia suficiente.
8. Para formatos colombianos, un punto seguido de tres dígitos normalmente es separador de miles: "$183.770" = 183770 y "$2.923.969" = 2923969. Si aparece "$183.770,00", los puntos son miles y la coma son decimales.
9. En otros bancos puede aparecer coma como separador de miles: "$20,900" = 20900. Si aparece "$83.60", el punto es decimal y el valor es 83.60. Devuelve el texto visible en monto_texto para que el sistema determine el valor de forma determinista.
22. Extrae exactamente el establecimiento/comercio cuando aparezca.
23. Si aparece una tarjeta, extrae solamente los últimos 4 dígitos cuando sean visibles, por ejemplo ****1735.
24. Conserva el texto del movimiento bancario en descripcion_banco, resumido pero fiel.
25. No inventes datos que no estén visibles.
26. Puede haber varios movimientos en una sola imagen. Detecta todos los que sean legibles.
13. CRÍTICO: cada movimiento bancario normalmente tiene UN SOLO monto principal, que es el valor de la transacción mostrado en la zona numérica de monto de esa fila. NO conviertas números que formen parte del nombre del comercio, descripción, referencia, número de establecimiento, código, terminal, tarjeta o cualquier otro texto en un movimiento adicional.
14. Si el nombre del comercio contiene números, esos números pertenecen al comercio. Ejemplo: "SUPERINTENDIA OLIMPICA 136" debe ser un solo comercio; el "136" NO es un monto y NO debe crear otro movimiento.
15. Si una misma fila tiene un monto principal y después aparecen otros números en el texto descriptivo, conserva esos números dentro de descripcion_banco y no los uses como monto.
16. Solo crea un movimiento adicional cuando exista visualmente otra fila/registro bancario independiente con su propia fecha o separador de movimiento y su propio monto principal.
17. Si una cantidad parece provenir únicamente de texto OCR dentro del comercio/descripción y no de la zona de monto, NO la uses como monto. Es preferible omitir un movimiento dudoso que inventar un gasto.
18. Hoy es ${hoy}, pero no supongas que las compras son de hoy.
19. Para Banco de Bogotá, la fecha puede aparecer como "02/09/2026" en unas capturas y como "7 sep 2026", "7 sep. 2026" o "7 sept. 2026" en otras capturas del MISMO banco. Todas son fechas válidas y deben conservarse exactamente en fecha; no descartes un movimiento negativo por usar un formato de fecha diferente.
20. Si una fecha aparece con abreviatura de mes (ene, feb, mar, abr, may, jun, jul, ago, sep, sept, oct, nov, dic), interprétala como fecha, no como texto inválido. Si incluye el año, úsalo; si no incluye el año, usa el año actual.
21. No confundas los formatos de fecha de Banco de Bogotá con el perfil monetario de Lulo. El formato COMA_MILES es exclusivo del perfil Lulo; una fecha como "7 sep 2026" NO indica Lulo.

Ejemplos obligatorios de lectura:
- "$183.770" -> monto_texto: "183.770"
- "$2.923.969" -> monto_texto: "2.923.969"
- "$183.770,00" -> monto_texto: "183.770,00"
- "$20,900" -> monto_texto: "20,900"
- "$83.60" -> monto_texto: "83.60"

La respuesta debe ser exclusivamente el objeto estructurado solicitado.`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "gpt-5.4-nano",
      store: false,
      reasoning: { effort: "none" },
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: `data:${mime};base64,${base64}`, detail: "high" }
        ]
      }],
      text: {
        format: {
          type: "json_schema",
          name: "movimientos_bancarios_foto_v1",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              movimientos: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    fecha: { type: "string" },
                    monto_texto: { type: "string" },
                    comercio: { type: ["string", "null"] },
                    banco_detectado: { type: ["string", "null"] },
                    formato_monetario: { type: "string", enum: ["PUNTO_MILES", "COMA_MILES", "DESCONOCIDO"] },
                    tarjeta_ultimos4: { type: ["string", "null"] },
                    descripcion_banco: { type: "string" },
                    tipo: { type: "string", enum: ["gasto"] },
                    confianza: { type: "string", enum: ["alta", "media", "baja"] }
                  },
                  required: ["fecha", "monto_texto", "comercio", "banco_detectado", "formato_monetario", "tarjeta_ultimos4", "descripcion_banco", "tipo", "confianza"]
                }
              },
              positivos_ignorados: { type: "integer", minimum: 0 },
              transferencias_negativas_ignoradas: { type: "integer", minimum: 0 }
            },
            required: ["movimientos", "positivos_ignorados", "transferencias_negativas_ignoradas"]
          }
        }
      },
      max_output_tokens: 900
    })
  });

  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch (_) {}

  if (!response.ok) {
    const code = data?.error?.code || data?.error?.type || "";
    const message = data?.error?.message || raw.slice(0, 300);
    throw new Error(`OpenAI HTTP ${response.status}${code ? ` · ${code}` : ""} · ${message}`);
  }

  const salida = extraerTextoRespuestaIA(data);
  if (!salida) throw new Error("OpenAI no devolvió una respuesta estructurada");

  let resultado;
  try { resultado = JSON.parse(salida); } catch (_) {
    throw new Error("La respuesta de IA no fue JSON válido");
  }

  let movimientos = Array.isArray(resultado?.movimientos) ? resultado.movimientos : [];
  // Protección robusta contra falsos movimientos creados por números que forman
  // parte del comercio/descripción de otra fila. Ejemplo real:
  // "SUPERTIENDA OLIMPICA 136" + monto principal "$183.770".
  // En ese caso 136 NO es un gasto independiente.
  // Segunda barrera: si la IA devolvió como monto un número que en realidad
  // está dentro de una llave/teléfono/tarjeta/referencia de la descripción,
  // elimínalo antes de crear pendientes. El monto válido de una fila sigue
  // siendo el que aparece en la zona monetaria visible.
  movimientos = movimientos.filter(m => !esMontoFalsoPorTextoBancario(m));

  if (movimientos.length > 1) {
    const normalizarDigitos = (v) => String(v || '').replace(/\D/g, '');
    const textosOtros = (idx) => movimientos
      .filter((_, j) => j !== idx)
      .map(o => `${o?.comercio || ''} ${o?.descripcion_banco || ''}`.trim());

    movimientos = movimientos.filter((m, idx) => {
      const tokenMonto = String(m?.monto_texto || '').trim();
      const montoPlano = normalizarDigitos(tokenMonto);
      if (!montoPlano) return true;

      // Un valor de hasta 4 dígitos que aparece literalmente dentro del
      // comercio/descripción de otra fila se considera un número de texto,
      // no una transacción. Exigimos además que la otra fila tenga un monto
      // sustancialmente mayor para no eliminar dos compras legítimas pequeñas.
      if (montoPlano.length <= 4) {
        const otros = movimientos.filter((_, j) => j !== idx);
        const apareceEnNombre = otros.some(o => {
          const texto = `${o?.comercio || ''} ${o?.descripcion_banco || ''}`;
          const digitosTexto = normalizarDigitos(texto);
          return digitosTexto.includes(montoPlano);
        });
        const hayMovimientoMayor = otros.some(o => {
          const otroMonto = normalizarDigitos(o?.monto_texto || '');
          return otroMonto.length >= 4 && Number(otroMonto) > Number(montoPlano) * 5;
        });
        if (apareceEnNombre && hayMovimientoMayor) return false;
      }

      return true;
    });
  }
  resultado.movimientos = movimientos;
  const perfilMonetario = bancoForzado || obtenerPerfilBancoDesdeResultado(resultado);
  if (perfilMonetario) {
    resultado.banco_perfil = perfilMonetario.nombre;
    resultado.formato_monetario = perfilMonetario.formato;
  }
  const uso = formatearInfoIA({ usage: data?.usage || null });

  let texto = `📸 LECTURA DE MOVIMIENTOS — FASE 1\n\n`;
  if (!movimientos.length) {
    texto += `No encontré compras/gastos negativos legibles en esta imagen.`;
  } else {
    texto += `🔎 Encontré ${movimientos.length} ${movimientos.length === 1 ? "gasto" : "gastos"}:\n\n`;
    movimientos.forEach((m, i) => {
      texto += `${i + 1}. 📅 ${formatearFecha(m.fecha)}\n`;
      texto += `   💰 ${formatearPesos(parsearMontoImagen(m.monto_texto, perfilMonetario?.formato || m.formato_monetario || resultado.formato_monetario))}\n`;
      texto += `   🏪 ${m.comercio || "Comercio no identificado"}\n`;
      if (m.tarjeta_ultimos4) texto += `   💳 TC ****${m.tarjeta_ultimos4}\n`;
      texto += `   🧾 ${m.descripcion_banco || "Sin descripción"}\n\n`;
    });
  }

  if (resultado?.banco_perfil || resultado?.banco_detectado) texto += `🏦 Banco/formato: ${resultado.banco_perfil || resultado.banco_detectado} · ${resultado.formato_monetario || "DESCONOCIDO"}\n`;
  texto += `🚫 Positivos ignorados: ${Number(resultado?.positivos_ignorados || 0)}\n`;
  texto += `↔️ Transferencias negativas ignoradas: 0 (los negativos también pasan a revisión)\n\n`;
  texto += `ℹ️ Fase 1: estos datos SOLO fueron leídos. No se guardó ningún gasto en D1.\n${uso}`;

  for (const m of movimientos) {
    // Conservamos monto_texto para que la fase de importación a D1 pueda
    // volver a interpretar el valor de forma determinista según el perfil
    // monetario del banco. No dependemos de Number("183.770"), que sería 183.77.
    m.monto = parsearMontoImagen(m.monto_texto, perfilMonetario?.formato || m.formato_monetario || resultado.formato_monetario);
  }

  return { texto, resultado, usage: data?.usage || null };
}

function parsearMontoImagen(valorTexto, formato = "") {
  if (valorTexto === null || valorTexto === undefined) return 0;

  let v = String(valorTexto).trim().replace(/[^0-9.,-]/g, "").replace(/-/g, "");
  if (!v) return 0;

  const puntos = (v.match(/\./g) || []).length;
  const comas = (v.match(/,/g) || []).length;

  // Perfil explícito: evita que la IA o JavaScript confundan miles con decimales.
  if (formato === "PUNTO_MILES") {
    // 1.234.567,89 -> 1234567.89 ; 1.234 -> 1234 ; 83.60 -> 83.60 si no parece miles.
    if (puntos > 0 && comas > 0) {
      const ultimoSeparador = Math.max(v.lastIndexOf("."), v.lastIndexOf(","));
      const ultimaComa = v.lastIndexOf(",");
      if (ultimaComa === ultimoSeparador) {
        const entero = v.slice(0, ultimaComa).replace(/[.,]/g, "");
        const dec = v.slice(ultimaComa + 1);
        return Number(`${entero}.${dec}`) || 0;
      }
    }
    if (puntos > 0) {
      const partes = v.split(".");
      if (partes.length > 1 && partes.slice(1).every(x => x.length === 3)) return Number(partes.join("")) || 0;
      if (partes.length === 2 && partes[1].length === 2) return Number(v) || 0;
      if (partes.length > 2) return Number(partes.join("")) || 0;
    }
    if (comas > 0) {
      const partes = v.split(",");
      if (partes.length === 2 && partes[1].length === 2) return Number(`${partes[0].replace(/\./g, "")}.${partes[1]}`) || 0;
      return Number(partes.join("")) || 0;
    }
    return Number(v) || 0;
  }

  if (formato === "COMA_MILES") {
    // 1,234,567.89 -> 1234567.89 ; 20,900 -> 20900 ; 83.60 -> 83.60
    if (comas > 0 && puntos > 0) {
      const ultimoPunto = v.lastIndexOf(".");
      const entero = v.slice(0, ultimoPunto).replace(/[,\.]/g, "");
      const dec = v.slice(ultimoPunto + 1);
      return Number(`${entero}.${dec}`) || 0;
    }
    if (comas > 0) {
      const partes = v.split(",");
      if (partes.length > 1 && partes.slice(1).every(x => x.length === 3)) return Number(partes.join("")) || 0;
      if (partes.length === 2 && partes[1].length === 2) return Number(`${partes[0]}.${partes[1]}`) || 0;
      return Number(partes.join("")) || 0;
    }
    if (puntos > 0) return Number(v) || 0;
    return Number(v) || 0;
  }

  // Fallback conservador cuando no conocemos el banco.
  if (puntos > 0 && comas > 0) {
    const ultimoPunto = v.lastIndexOf(".");
    const ultimaComa = v.lastIndexOf(",");
    if (ultimaComa > ultimoPunto) {
      const decimales = v.length - ultimaComa - 1;
      const entero = v.slice(0, ultimaComa).replace(/[.,]/g, "");
      if (decimales === 0) return Number(entero) || 0;
      return Number(`${entero}.${v.slice(ultimaComa + 1)}`) || 0;
    }
    const decimales = v.length - ultimoPunto - 1;
    const entero = v.slice(0, ultimoPunto).replace(/[.,]/g, "");
    if (decimales === 0) return Number(entero) || 0;
    return Number(`${entero}.${v.slice(ultimoPunto + 1)}`) || 0;
  }

  if (puntos > 0) {
    const partes = v.split(".");
    if (partes.length > 1 && partes.slice(1).every(x => x.length === 3)) return Number(partes.join("")) || 0;
    if (partes.length === 2 && partes[1].length === 2) return Number(v) || 0;
    if (partes.length > 2) return Number(partes.join("")) || 0;
    return Number(v.replace(/\./g, "")) || 0;
  }

  if (comas > 0) {
    const partes = v.split(",");
    if (partes.length > 1 && partes.slice(1).every(x => x.length === 3)) return Number(partes.join("")) || 0;
    if (partes.length === 2 && partes[1].length === 2) return Number(`${partes[0]}.${partes[1]}`) || 0;
    return Number(partes.join("")) || 0;
  }

  return Number(v) || 0;
}

function perfilesBancos() {
  return {
    Lulo: { nombre: "Lulo", formato: "COMA_MILES", aliases: ["lulo", "lulo bank", "lulo banco"] },
    ColombianoPuntoMiles: { nombre: "Formato colombiano (punto miles)", formato: "PUNTO_MILES", aliases: ["colombiano", "punto miles", "banco bogota", "banco de bogota", "bogota"] }
  };
}

function detectarBancoPorCaption(caption) {
  const t = normalizar(caption || "");
  if (!t) return null;
  const perfiles = perfilesBancos();
  for (const perfil of Object.values(perfiles)) {
    if (perfil.aliases.some(a => contiene(t, [a]))) return perfil;
  }
  return null;
}

function obtenerPerfilBancoDesdeResultado(resultado) {
  const nombre = normalizar(resultado?.banco_detectado || resultado?.banco_perfil || "");
  if (!nombre) {
    const formato = resultado?.formato_monetario;
    if (formato === "COMA_MILES") return perfilesBancos().Lulo;
    if (formato === "PUNTO_MILES") return perfilesBancos().ColombianoPuntoMiles;
    return null;
  }
  if (contiene(nombre, ["lulo"])) return perfilesBancos().Lulo;
  if (resultado?.formato_monetario === "COMA_MILES") return perfilesBancos().Lulo;
  if (resultado?.formato_monetario === "PUNTO_MILES") return perfilesBancos().ColombianoPuntoMiles;
  return null;
}

function extraerTextoRespuestaIA(data) {
  let textoSalida = data?.output_text || "";
  if (!textoSalida && Array.isArray(data?.output)) {
    const partes = [];
    for (const item of data.output) {
      if (item?.type === "message" && Array.isArray(item.content)) {
        for (const content of item.content) {
          if (content?.type === "output_text" && typeof content.text === "string") {
            partes.push(content.text);
          }
        }
      }
    }
    textoSalida = partes.join("\n").trim();
  }
  return String(textoSalida || "").trim();
}

function detectarMimeImagen(filePath) {
  const p = String(filePath || "").toLowerCase();
  if (p.endsWith(".png")) return "image/png";
  if (p.endsWith(".webp")) return "image/webp";
  if (p.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}


function documentoExcelDataUrl(nombreArchivo, bytes) {
  const nombre = String(nombreArchivo || "").toLowerCase();
  let mime = "application/octet-stream";
  if (nombre.endsWith(".xls")) {
    mime = "application/vnd.ms-excel";
  } else if (nombre.endsWith(".xlsx")) {
    mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  // Responses API expects inline file_data as a base64 data URL.
  return `data:${mime};base64,${bytesToBase64(bytes)}`;
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

// ============================================================
// FALLBACK IA - CONSULTAS NATURALES (V28)
// ============================================================

function iaEstaActiva(env) {
  // Para probar IA: AI_ENABLED=true. Si la variable no existe, se activa
  // automáticamente cuando existe OPENAI_API_KEY.
  return String(env.AI_ENABLED ?? "true").toLowerCase() === "true" && !!env.OPENAI_API_KEY;
}

function estadoIA(env) {
  const tieneClave = !!env.OPENAI_API_KEY;
  const habilitada = String(env.AI_ENABLED ?? "true").toLowerCase() === "true";
  const activa = habilitada && tieneClave;

  return `🤖 ESTADO DE IA

` +
    `• IA habilitada: ${habilitada ? "SÍ" : "NO"}
` +
    `• API key configurada: ${tieneClave ? "SÍ" : "NO"}
` +
    `• Estado: ${activa ? "ACTIVA" : "INACTIVA"}
` +
    `• Modelo: GPT-5.4 nano

` +
    `Cada consulta con IA muestra en Telegram cuántos tokens consumió esa llamada.

` +
    `💳 Saldo de créditos: el bot no consulta el saldo de facturación para evitar llamadas innecesarias. Revísalo en la Facturación/Uso de la API de OpenAI.

` +
    `Para apagar IA sin quitar la clave: pon AI_ENABLED=false en las variables del Worker.`;
}

function pareceConsultaIA(textoNormalizado, textoOriginal) {
  const t = normalizar(textoNormalizado || textoOriginal || "");
  if (!t || t.length < 3) return false;

  if (t.startsWith("/")) return false;
  if (esSaludo(t) || esSolicitudAyuda(t)) return false;

  // Preguntas explícitas: tienen prioridad sobre la detección de "posible gasto".
  // Esto evita que "cuál ha sido el gasto más alto de hoy" sea tratado como
  // un nuevo gasto solo porque contiene la palabra "gasto".
  const esPregunta =
    /\b(cual|cu[aá]l|cuanto|cu[aá]nto|cuantas|cu[aá]ntas|que|qué|dime|muestrame|mu[eé]strame|tengo|hay|en\s+que|en\s+qué|quiero\s+saber|podrias|podr[ií]as)\b/.test(t) &&
    /\b(gasto|gastos|gast[eé]|gastado|compras|compra|dinero|plata|movimientos|movimiento|pagos|pago|he|has|se\s+me\s+ha\s+ido|llevo)\b/.test(t);

  const tienePeriodo =
    /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/.test(t) ||
    /\b(este|mes|año|ano|pasado|anterior|ultimos?|últimos?|dias|d[ií]as|hoy|ayer|antier|antes\s+de\s+ayer|semana|semanas)\b/.test(t) ||
    /\b20\d{2}\b/.test(t) ||
    /\b\d{1,2}[\/-]\d{1,2}[\/-]20\d{2}\b/.test(t);

  // Frases de consulta muy naturales que no necesariamente contienen "gasto".
  const consultaAbierta =
    /\b(en\s+que|en\s+qué)\s+se\s+me\s+ha\s+ido\b/.test(t) ||
    /\bque\s+tanto\s+dinero\s+se\s+me\s+ha\s+ido\b/.test(t) ||
    /\bcuanto\s+dinero\s+me\s+he\s+gastado\b/.test(t) ||
    /\bque\s+compras\s+he\s+hecho\b/.test(t) ||
    /\bque\s+he\s+comprado\b/.test(t) ||
    /\btengo\s+algo\s+de\b/.test(t) ||
    /\bcu[aá]l\s+ha\s+sido\b/.test(t);

  if (esPregunta || tienePeriodo || consultaAbierta) return true;

  // Si parece un registro de gasto y no hay señales de consulta, dejamos
  // que el motor original se encargue.
  if (esPosibleGasto(t)) return false;

  // Para texto no reconocido que no parece un gasto, dejamos que la IA decida.
  return true;
}

function formatearInfoIA(respuestaIA) {
  const u = respuestaIA?.usage;
  if (!u) return "🤖 Consulta interpretada con IA.";

  const total = Number(u.total_tokens || 0);
  const entrada = Number(u.input_tokens || 0);
  const salida = Number(u.output_tokens || 0);

  if (!total) return "🤖 Consulta interpretada con IA.";

  return `🤖 IA usada · ${total.toLocaleString("es-CO")} tokens (entrada ${entrada.toLocaleString("es-CO")} · salida ${salida.toLocaleString("es-CO")})`;
}

function mensajeAvisoIA(respuestaIA) {
  const base = mensajeAvisoIADetallado(respuestaIA);
  return `${base}\n\nSigo funcionando normalmente con el motor básico.`;
}

function mensajeAvisoIADetallado(respuestaIA) {
  const razon = respuestaIA?.razon;
  const status = respuestaIA?.status ? `HTTP ${respuestaIA.status}` : "";
  const code = respuestaIA?.code ? `Código: ${respuestaIA.code}` : "";
  const detalle = respuestaIA?.message ? `Detalle: ${String(respuestaIA.message).slice(0, 220)}` : "";
  const diagnostico = [status, code, detalle].filter(Boolean).join("\n");

  if (razon === "saldo_agotado") {
    return `⚠️ IA no disponible: el saldo/cuota de OpenAI parece agotado.${diagnostico ? `\n\n${diagnostico}` : ""}`;
  }
  if (razon === "clave_invalida") {
    return `⚠️ IA no disponible: revisa la OPENAI_API_KEY en Cloudflare.${diagnostico ? `\n\n${diagnostico}` : ""}`;
  }
  if (razon === "limite") {
    return `⚠️ IA no disponible temporalmente: se alcanzó un límite de OpenAI.${diagnostico ? `\n\n${diagnostico}` : ""}`;
  }
  return `⚠️ IA no pudo responder en este momento.${diagnostico ? `\n\n${diagnostico}` : ""}`;
}

async function probarConexionIA(env) {
  if (!env.OPENAI_API_KEY) return { estado: "error", razon: "sin_clave" };
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-5.4-nano",
        store: false,
        reasoning: { effort: "none" },
        input: "Responde únicamente con la palabra OK.",
        max_output_tokens: 16
      })
    });
    const raw = await response.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch (_) {}
    if (!response.ok) {
      const code = data?.error?.code || data?.error?.type || "";
      let razon = "api";
      if (response.status === 401 || code === "invalid_api_key") razon = "clave_invalida";
      else if (response.status === 429 || code === "insufficient_quota" || code === "credit_balance_exhausted" || code === "organization_spend_limit_exceeded" || code === "project_spend_limit_exceeded") razon = "saldo_agotado";
      return { estado: "error", razon, status: response.status, code, message: data?.error?.message || raw.slice(0, 220) };
    }
    return { estado: "ok", usage: data?.usage || null };
  } catch (error) {
    return { estado: "error", razon: "conexion", message: String(error?.message || error).slice(0, 220) };
  }
}

function construirCatalogoParaIA() {
  const categorias = CATALOGO_FALLBACK.categorias.map(c => ({
    nombre: c.nombre,
    subcategorias: CATALOGO_FALLBACK.subcategorias
      .filter(s => s.categoria_id === c.id)
      .map(s => s.nombre)
  }));
  return categorias;
}

async function interpretarConsultaConIA(env, textoOriginal) {
  if (!env.OPENAI_API_KEY) return { estado: "error", razon: "sin_clave" };

  const hoy = fechaLocalISO();
  const catalogo = construirCatalogoParaIA();
  const systemPrompt = `Eres el intérprete de consultas de un bot personal de gastos en español.

Tu trabajo NO es responder al usuario ni consultar una base de datos. Tu trabajo es convertir cualquier pregunta natural sobre los gastos en una consulta estructurada que otro programa ejecutará sobre D1.

Comprende el SIGNIFICADO, no palabras exactas. No dependas de una lista de frases.

INTENCIONES:
1) CONSULTA_GASTO: quiere calcular o consultar gastos aplicando filtros.
2) RESUMEN_CATEGORIAS: quiere saber en qué se fue el dinero o cómo se distribuyó por categorías.
3) BUSCAR_MOVIMIENTOS: quiere ver los movimientos que coinciden con filtros.
4) RANKING_GASTOS: quiere encontrar los gastos más caros/baratos, los primeros/últimos o los N mayores/menores.
5) NO_CONSULTA: es un registro de gasto, saludo, ayuda, orden no relacionada o no es una consulta de gastos.

OPERACIONES:
- total: suma de montos.
- cantidad: cantidad de movimientos/operaciones.
- movimientos: listar movimientos.
- promedio: promedio del monto de los movimientos encontrados.
- minimo: movimiento de menor monto.
- maximo: movimiento de mayor monto.
- ranking: varios movimientos ordenados por monto.
- resumen_categoria: agrupar por categoría.

REGLAS PARA OPERACIONES:
- "cuánto", "cuánto gasté", "cuánto llevo", "qué tanto dinero" normalmente => total.
- "cuántos", "cuántas veces" => cantidad.
- "muéstrame", "qué compras", "qué gastos" => movimientos.
- "más barato", "más pequeña", "menor valor", "que menos costó" => minimo.
- "más caro", "más grande", "mayor valor", "que más costó" => maximo.
- "los 5 más caros", "top 5 gastos" => ranking con orden descendente y límite 5.
- "los 3 más baratos" => ranking con orden ascendente y límite 3.
- "en qué se me fue la plata", "en qué gasté más" cuando pide distribución => resumen_categoria o ranking según el sentido.

NIVEL DE RESULTADO:
- "compra", "gasto" o "movimiento" se refiere normalmente al MOVIMIENTO completo registrado.
- "artículo", "producto" o "cosa que compré" puede referirse al concepto/detalle; usa nivel "movimiento" salvo que la pregunta pida explícitamente artículos individuales.
- Para "la compra más pequeña" o "el gasto más grande", usa nivel "movimiento".

FILTROS DISPONIBLES:
- categoria: SOLO una categoría del catálogo.
- subcategoria: SOLO una subcategoría del catálogo.
- comercio: tienda, plataforma, restaurante o proveedor.
- persona: persona asociada al gasto, por ejemplo Diana.
- concepto: producto o servicio comprado.
- canal: por ejemplo Rappi.
- forma_pago: por ejemplo TC o efectivo.

IMPORTANTE SOBRE FILTROS:
- "cosas para la casa", "gastos del hogar", etc. puede mapearse semánticamente a categoria "Hogar".
- "comiendo afuera", "salidas a comer", "restaurantes" puede mapearse a "Restaurantes y Rappi"; si claramente significa comer por fuera, usa la subcategoría correspondiente.
- Temu, Amazon, MercadoLibre, Jumbo, Pandora, Vélez, Carulla, etc. normalmente son comercio.
- "cafetera", "zapatos", "masajes", etc. normalmente son concepto.
- "a Diana", "para Diana" o "de Diana" cuando habla de quién recibió el gasto => persona Diana.
- No conviertas una forma de pago en categoría.
- No inventes categorías ni subcategorías.
- Si una expresión es ambigua, usa el filtro más natural y conserva null en los demás.

PERÍODOS DISPONIBLES:
Hoy es ${hoy}.
Devuelve fechas ISO YYYY-MM-DD cuando corresponda.
- este mes => mes_actual.
- mes pasado / el mes anterior => mes_anterior.
- un mes nombrado como agosto => mes_especifico con ese mes del año actual, salvo que indique otro año.
- "en 2025", "durante 2024" => anio_especifico.
- este año / en el año => anio_actual.
- últimos 7 días / ultimos siete dias => ultimos_7_dias. Incluye hoy y los 6 días anteriores.
- últimos 30 días => ultimos_30_dias. Incluye hoy y los 29 días anteriores.
- desde el 1 hasta el 15 de agosto => rango_fechas.
- entre el 5 y el 20 de agosto => rango_fechas.
- una fecha concreta => rango_fechas con la misma fecha en desde y hasta.
- si no menciona período, usa todos.
- No inventes años. Si dice "agosto" sin año, usa el año actual.

IMPORTANTE: "mes pasado" NO es el mes actual. "últimos 7 días" NO es todo el mes. Si el usuario menciona un mes concreto como agosto, ese mes tiene prioridad sobre el mes actual. "en el año" significa año calendario actual.

CATÁLOGO ACTUAL:
${JSON.stringify(catalogo, null, 2)}

Devuelve únicamente el objeto estructurado solicitado.`;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-5.4-nano",
        store: false,
        reasoning: { effort: "none" },
        input: [
          { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
          { role: "user", content: [{ type: "input_text", text: String(textoOriginal || "") }] }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "consulta_gasto_v34",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                intencion: { type: "string", enum: ["CONSULTA_GASTO", "RESUMEN_CATEGORIAS", "BUSCAR_MOVIMIENTOS", "RANKING_GASTOS", "NO_CONSULTA"] },
                resultado: { type: "string", enum: ["total", "cantidad", "movimientos", "promedio", "minimo", "maximo", "ranking", "resumen_categoria"] },
                periodo_tipo: { type: "string", enum: ["mes_actual", "mes_especifico", "mes_anterior", "ultimos_7_dias", "ultimos_30_dias", "anio_actual", "anio_especifico", "rango_fechas", "todos", "no_aplica"] },
                periodo_mes: { type: ["string", "null"] },
                periodo_anio: { type: ["string", "null"] },
                fecha_desde: { type: ["string", "null"] },
                fecha_hasta: { type: ["string", "null"] },
                categoria: { type: ["string", "null"] },
                subcategoria: { type: ["string", "null"] },
                comercio: { type: ["string", "null"] },
                persona: { type: ["string", "null"] },
                concepto: { type: ["string", "null"] },
                canal: { type: ["string", "null"] },
                forma_pago: { type: ["string", "null"] },
                orden: { type: "string", enum: ["asc", "desc", "ninguno"] },
                limite: { type: "integer", minimum: 1, maximum: 20 },
                nivel: { type: "string", enum: ["movimiento", "articulo"] }
              },
              required: ["intencion", "resultado", "periodo_tipo", "periodo_mes", "periodo_anio", "fecha_desde", "fecha_hasta", "categoria", "subcategoria", "comercio", "persona", "concepto", "canal", "forma_pago", "orden", "limite", "nivel"]
            }
          }
        },
        max_output_tokens: 260
      })
    });

    const raw = await response.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch (_) {}

    if (!response.ok) {
      const code = data?.error?.code || data?.error?.type || "";
      let razon = "api";
      if (response.status === 401 || code === "invalid_api_key") razon = "clave_invalida";
      else if (response.status === 429 || code === "insufficient_quota" || code === "credit_balance_exhausted" || code === "organization_spend_limit_exceeded" || code === "project_spend_limit_exceeded") razon = "saldo_agotado";
      return { estado: "error", razon, status: response.status, code, message: data?.error?.message || raw.slice(0, 220) };
    }

    let textoSalida = data?.output_text || "";
    if (!textoSalida && Array.isArray(data?.output)) {
      const partes = [];
      for (const item of data.output) {
        if (item?.type === "message" && Array.isArray(item.content)) {
          for (const content of item.content) {
            if (content?.type === "output_text" && typeof content.text === "string") partes.push(content.text);
          }
        }
      }
      textoSalida = partes.join("\n").trim();
    }

    if (!textoSalida) {
      return { estado: "error", razon: "sin_respuesta", usage: data?.usage || null, status: response.status, message: "OpenAI respondió pero no entregó texto de salida." };
    }

    let resultado;
    try { resultado = JSON.parse(textoSalida); }
    catch (_) {
      return { estado: "error", razon: "respuesta_invalida", usage: data?.usage || null, status: response.status, message: `La IA respondió con un formato no esperado: ${textoSalida.slice(0, 160)}` };
    }

    console.log("RESULTADO IA V36", JSON.stringify(resultado));
    return { estado: "ok", consulta: resultado, usage: data?.usage || null };
  } catch (error) {
    console.log("ERROR INTERPRETANDO CONSULTA CON IA", error?.stack || error);
    return { estado: "error", razon: "conexion", message: String(error?.message || error).slice(0, 220) };
  }
}

function restarDiasISO(fechaISO, dias) {
  const d = new Date(`${fechaISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - Number(dias || 0));
  return d.toISOString().slice(0, 10);
}

function primerDiaMesAnteriorISO(fechaISO) {
  const d = new Date(`${fechaISO.slice(0, 7)}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 10);
}

function ultimoDiaMesAnteriorISO(fechaISO) {
  const d = new Date(`${fechaISO.slice(0, 7)}-01T12:00:00Z`);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

function reforzarPeriodoConsultaIA(consulta, textoOriginal) {
  const c = { ...(consulta || {}) };
  const t = normalizar(String(textoOriginal || ""));

  const hoy = fechaLocalISO();
  const anioActual = Number(hoy.slice(0, 4));

  const meses = {
    enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
    julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10,
    noviembre: 11, diciembre: 12
  };

  // Día concreto: "2 de septiembre", "2 septiembre", etc.
  // Debe tener prioridad sobre el detector de mes, porque si no la IA
  // puede convertir una consulta de un solo día en todo el mes.
  const dm = t.match(/\b(\d{1,2})\s+(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+(?:de|del)\s+)?(20\d{2})?\b/i);
  if (dm) {
    const mes = meses[dm[2].toLowerCase()];
    const anio = dm[3] ? Number(dm[3]) : anioActual;
    const fecha = `${anio}-${String(mes).padStart(2,"0")}-${String(Number(dm[1])).padStart(2,"0")}`;
    if (fechaISOValida(fecha)) {
      c.periodo_tipo = "rango_fechas";
      c.fecha_desde = fecha;
      c.fecha_hasta = fecha;
      c.periodo_mes = null;
      c.periodo_anio = null;
      return c;
    }
  }

  // Mes nombrado: "agosto", "agosto de 2025", etc.
  const mm = t.match(/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b(?:\s+(?:de|del)\s+)?(20\d{2})?/i);
  if (mm) {
    const mes = meses[mm[1].toLowerCase()];
    const anio = mm[2] ? Number(mm[2]) : anioActual;
    c.periodo_tipo = "mes_especifico";
    c.periodo_mes = `${anio}-${String(mes).padStart(2, "0")}`;
    c.periodo_anio = String(anio);
    c.fecha_desde = null;
    c.fecha_hasta = null;
    return c;
  }

  // Últimos N días: hoy + los N-1 días anteriores.
  const md = t.match(/\b(?:ultimos?|últimos?|pasados?|anteriores?)\s+(\d+)\s+d[ií]as\b/);
  if (md) {
    const n = Math.max(1, Math.min(3660, Number(md[1])));
    c.periodo_tipo = n === 7 ? "ultimos_7_dias" : n === 30 ? "ultimos_30_dias" : "rango_fechas";
    c.fecha_desde = restarDiasISO(hoy, n - 1);
    c.fecha_hasta = hoy;
    c.periodo_mes = null;
    c.periodo_anio = null;
    return c;
  }

  if (/\bultimos?\s+siete\s+d[ií]as\b/.test(t)) {
    c.periodo_tipo = "ultimos_7_dias";
    c.fecha_desde = restarDiasISO(hoy, 6);
    c.fecha_hasta = hoy;
    c.periodo_mes = null;
    c.periodo_anio = null;
    return c;
  }

  if (/\bultimos?\s+treinta\s+d[ií]as\b/.test(t)) {
    c.periodo_tipo = "ultimos_30_dias";
    c.fecha_desde = restarDiasISO(hoy, 29);
    c.fecha_hasta = hoy;
    c.periodo_mes = null;
    c.periodo_anio = null;
    return c;
  }

  // Mes pasado / anterior.
  if (/\bmes\s+(pasado|anterior)\b|\b(?:ultimo|último)\s+mes\b/.test(t)) {
    c.periodo_tipo = "mes_anterior";
    c.periodo_mes = null;
    c.periodo_anio = null;
    c.fecha_desde = null;
    c.fecha_hasta = null;
    return c;
  }

  // Año específico: "en 2025", "durante 2024", etc.
  const ya = t.match(/\b(?:en|durante|del|del\s+año|año)\s+(20\d{2})\b/);
  if (ya) {
    c.periodo_tipo = "anio_especifico";
    c.periodo_anio = ya[1];
    c.periodo_mes = null;
    c.fecha_desde = null;
    c.fecha_hasta = null;
    return c;
  }

  if (/\b(año|ano)\s+pasado\b|\b(año|ano)\s+anterior\b/.test(t)) {
    c.periodo_tipo = "anio_especifico";
    c.periodo_anio = String(anioActual - 1);
    c.periodo_mes = null;
    c.fecha_desde = null;
    c.fecha_hasta = null;
    return c;
  }

  if (/\b(este\s+año|este\s+ano|en\s+el\s+año|en\s+el\s+ano)\b/.test(t)) {
    c.periodo_tipo = "anio_actual";
    c.periodo_anio = String(anioActual);
    c.periodo_mes = null;
    c.fecha_desde = null;
    c.fecha_hasta = null;
    return c;
  }

  // Fechas explícitas dd/mm/yyyy o dd-mm-yyyy.
  const fechas = [...t.matchAll(/\b(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2})\b/g)];
  if (fechas.length) {
    const f1 = fechas[0];
    const desde = `${f1[3]}-${String(f1[2]).padStart(2,"0")}-${String(f1[1]).padStart(2,"0")}`;
    const f2 = fechas[1] || f1;
    const hasta = `${f2[3]}-${String(f2[2]).padStart(2,"0")}-${String(f2[1]).padStart(2,"0")}`;
    c.periodo_tipo = "rango_fechas";
    c.fecha_desde = desde;
    c.fecha_hasta = hasta;
    c.periodo_mes = null;
    c.periodo_anio = null;
    return c;
  }

  return c;
}

function resolverPeriodoConsultaIA(consulta) {
  const hoy = fechaLocalISO();
  const tipo = consulta?.periodo_tipo || "todos";
  const mesActual = hoy.slice(0, 7);
  const anioActual = hoy.slice(0, 4);

  if (tipo === "mes_actual") return { desde: `${mesActual}-01`, hasta: hoy, etiqueta: `${nombreMes(Number(mesActual.slice(5, 7))).toUpperCase()} ${anioActual}` };

  if (tipo === "mes_especifico") {
    const m = String(consulta.periodo_mes || "");
    if (/^\d{4}-\d{2}$/.test(m)) {
      const n = Number(m.slice(5, 7));
      if (n >= 1 && n <= 12) {
        const ultimo = new Date(Date.UTC(Number(m.slice(0, 4)), n, 0)).toISOString().slice(0, 10);
        return { desde: `${m}-01`, hasta: ultimo, etiqueta: `${nombreMes(n).toUpperCase()} ${m.slice(0, 4)}` };
      }
    }
  }

  if (tipo === "mes_anterior") {
    const desde = primerDiaMesAnteriorISO(hoy);
    const hasta = ultimoDiaMesAnteriorISO(hoy);
    return { desde, hasta, etiqueta: `${nombreMes(Number(desde.slice(5, 7))).toUpperCase()} ${desde.slice(0, 4)}` };
  }

  if (tipo === "ultimos_7_dias") {
    const desde = restarDiasISO(hoy, 6);
    return { desde, hasta: hoy, etiqueta: `ÚLTIMOS 7 DÍAS (${formatearFecha(desde)} - ${formatearFecha(hoy)})` };
  }

  if (tipo === "ultimos_30_dias") {
    const desde = restarDiasISO(hoy, 29);
    return { desde, hasta: hoy, etiqueta: `ÚLTIMOS 30 DÍAS (${formatearFecha(desde)} - ${formatearFecha(hoy)})` };
  }

  if (tipo === "anio_actual") return { desde: `${anioActual}-01-01`, hasta: hoy, etiqueta: `AÑO ${anioActual}` };

  if (tipo === "anio_especifico") {
    const a = String(consulta.periodo_anio || "");
    if (/^\d{4}$/.test(a)) return { desde: `${a}-01-01`, hasta: `${a}-12-31`, etiqueta: `AÑO ${a}` };
  }

  if (tipo === "rango_fechas") {
    const desde = /^\d{4}-\d{2}-\d{2}$/.test(String(consulta.fecha_desde || "")) ? String(consulta.fecha_desde) : hoy;
    const hasta = /^\d{4}-\d{2}-\d{2}$/.test(String(consulta.fecha_hasta || "")) ? String(consulta.fecha_hasta) : desde;
    return { desde: desde <= hasta ? desde : hasta, hasta: desde <= hasta ? hasta : desde, etiqueta: `${formatearFecha(desde)} - ${formatearFecha(hasta)}` };
  }

  if (tipo === "todos" || tipo === "no_aplica") return { desde: null, hasta: null, etiqueta: "TODOS LOS PERÍODOS" };

  return { desde: `${mesActual}-01`, hasta: hoy, etiqueta: `${nombreMes(Number(mesActual.slice(5, 7))).toUpperCase()} ${anioActual}` };
}

function normalizarFiltroIA(valor) {
  if (valor == null) return null;
  const t = normalizar(String(valor)).trim();
  return t || null;
}

function limitarConsultaIA(consulta) {
  const c = { ...(consulta || {}) };
  c.orden = ["asc", "desc", "ninguno"].includes(c.orden) ? c.orden : "ninguno";
  c.limite = Math.min(20, Math.max(1, Number(c.limite || 1)));
  c.nivel = c.nivel === "articulo" ? "articulo" : "movimiento";
  return c;
}

async function ejecutarConsultaIA(env, chatId, consulta, textoOriginal = "") {
  if (!env.DB) return "⚠️ No está disponible la base de datos.";

  const c = reforzarPeriodoConsultaIA(limitarConsultaIA(consulta), textoOriginal);
  const periodo = resolverPeriodoConsultaIA(c);
  const intencion = c.intencion;
  const resultado = c.resultado;
  const filtros = {
    categoria: normalizarFiltroIA(c.categoria),
    subcategoria: normalizarFiltroIA(c.subcategoria),
    comercio: normalizarFiltroIA(c.comercio),
    persona: normalizarFiltroIA(c.persona),
    concepto: normalizarFiltroIA(c.concepto),
    canal: normalizarFiltroIA(c.canal),
    forma_pago: normalizarFiltroIA(c.forma_pago)
  };

  if (intencion === "RESUMEN_CATEGORIAS" || resultado === "resumen_categoria") {
    return await ejecutarResumenCategoriasIA(env, chatId, periodo);
  }

  const where = ["g.chat_id=?", "g.estado='confirmado'"];
  const binds = [String(chatId)];
  if (periodo.desde && periodo.hasta) {
    where.push("g.fecha>=?", "g.fecha<=?");
    binds.push(periodo.desde, periodo.hasta);
  }

  // Las categorías/subcategorías históricas pueden tener diferencias de espacios
  // alrededor de "/" (por ejemplo "Pagos varios/ Oscio"). Para que el resumen
  // y el detalle trabajen exactamente sobre el mismo conjunto, normalizamos esos
  // espacios directamente en SQL antes de comparar.
  const normalizarSlashSQL = (campo) =>
    `replace(replace(replace(lower(coalesce(${campo},'')), ' / ', '/'), '/ ', '/'), ' /', '/')`;

  const categoriaCatalogo = obtenerCategoriaCatalogoPorNombre(filtros.categoria);
  const subcategoriaCatalogo = !categoriaCatalogo && filtros.subcategoria
    ? CATALOGO_FALLBACK.subcategorias.find(sc =>
        normalizarNombreReporte(sc.nombre) === normalizarNombreReporte(filtros.subcategoria)
      )
    : null;

  const agregarLike = (campo, valor) => {
    if (!valor) return;
    where.push(`lower(coalesce(${campo},'')) LIKE ?`);
    binds.push(`%${valor}%`);
  };

  if (categoriaCatalogo) {
    where.push(`${normalizarSlashSQL("i.categoria")} = ?`);
    binds.push(normalizarNombreReporte(categoriaCatalogo.nombre));
  } else if (filtros.categoria) {
    where.push(`${normalizarSlashSQL("i.categoria")} LIKE ?`);
    binds.push(`%${normalizarNombreReporte(filtros.categoria)}%`);
  }

  if (subcategoriaCatalogo) {
    where.push(`${normalizarSlashSQL("i.subcategoria")} = ?`);
    binds.push(normalizarNombreReporte(subcategoriaCatalogo.nombre));
  } else if (filtros.subcategoria) {
    where.push(`${normalizarSlashSQL("i.subcategoria")} LIKE ?`);
    binds.push(`%${normalizarNombreReporte(filtros.subcategoria)}%`);
  }
  agregarLike("i.comercio", filtros.comercio);
  agregarLike("i.persona", filtros.persona);
  agregarLike("i.concepto", filtros.concepto);
  agregarLike("i.canal", filtros.canal);
  agregarLike("i.forma_pago", filtros.forma_pago);

  const sql = `SELECT g.id AS gasto_id, g.fecha, g.created_at, i.concepto, i.detalle, i.monto, i.comercio, i.canal, i.persona, i.categoria, i.subcategoria, i.forma_pago FROM gastos g JOIN gasto_items i ON i.gasto_id=g.id WHERE ${where.join(" AND ")} ORDER BY g.fecha DESC, g.created_at DESC`;
  let rows = (await env.DB.prepare(sql).bind(...binds).all()).results || [];
  // No deduplicar movimientos en reportes: cada gasto registrado debe aparecer y sumar.

  if (!rows.length) {
    const partes = Object.entries(filtros).filter(([,v]) => v).map(([k,v]) => `${k}: ${v}`);
    const criterio = partes.length ? partes.join(" · ") : "esa consulta";
    return { texto: `🔎 CONSULTA — ${periodo.etiqueta}\n\n💰 Total: ${formatearPesosReporte(0)}\n\nNo encontré movimientos que coincidan con ${criterio}.` };
  }

  // Todas las operaciones de ranking/min/max se hacen sobre el movimiento completo.
  // Cada fila de gasto_items representa el movimiento/item registrado en el sistema.
  if (["minimo", "maximo", "ranking"].includes(resultado)) {
    const desc = c.orden === "desc" || resultado === "maximo";
    rows = [...rows].sort((a, b) => desc ? Number(b.monto || 0) - Number(a.monto || 0) : Number(a.monto || 0) - Number(b.monto || 0));
    const limite = resultado === "minimo" || resultado === "maximo" ? 1 : c.limite;
    const seleccion = rows.slice(0, limite);
    const titulo = resultado === "minimo" ? "💸 GASTO MÁS PEQUEÑO" : resultado === "maximo" ? "💰 GASTO MÁS GRANDE" : (desc ? `📊 TOP ${limite} GASTOS MÁS GRANDES` : `📊 TOP ${limite} GASTOS MÁS PEQUEÑOS`);
    let out = `${titulo} — ${periodo.etiqueta}\n\n`;
    seleccion.forEach((r, idx) => {
      const descripcion = descripcionParaReporte(r);
      out += `${resultado === "ranking" ? `${idx + 1}. ` : ""}📅 ${formatearFecha(r.fecha)}\n• ${descripcion} — ${formatearPesosSimpleReporte(r.monto)}\n\n`;
    });
    return { texto: `${out.trim()}\n\n🧾 Movimientos analizados: ${rows.length}` };
  }

  const total = rows.reduce((s, r) => s + Number(r.monto || 0), 0);
  const titulo = construirTituloConsultaIA(filtros, intencion);

  if (resultado === "cantidad") {
    return { texto: `🔎 ${titulo} — ${periodo.etiqueta}\n\n🔢 Movimientos: ${rows.length}` };
  }

  if (resultado === "promedio") {
    const promedio = rows.length ? total / rows.length : 0;
    return { texto: `🔎 ${titulo} — ${periodo.etiqueta}\n\n📊 Promedio: ${formatearPesosReporte(promedio)}\n🧾 Movimientos: ${rows.length}` };
  }

  if (resultado === "movimientos" || intencion === "BUSCAR_MOVIMIENTOS") {
    const limitePagina = 20;
    const pagina = rows.slice(0, limitePagina);
    let out = `🔎 ${titulo} — ${periodo.etiqueta}\n\n`;
    for (const r of pagina) {
      const descripcion = descripcionParaReporte(r);
      out += `📅 ${formatearFecha(r.fecha)}\n• ${descripcion} — ${formatearPesosSimpleReporte(r.monto)}\n\n`;
    }

    // Si la consulta tiene un período concreto y no tiene filtros adicionales,
    // ofrecemos paginación real para que el usuario pueda ver TODOS los
    // movimientos. No se altera el resultado ni se descartan registros: solo
    // se muestran por páginas para evitar mensajes demasiado largos de Telegram.
    let replyMarkup = null;
    if (rows.length > limitePagina && periodo.desde && periodo.hasta &&
        Object.values(filtros).every(v => !v)) {
      const callback = `repnext|${periodo.desde}|${periodo.hasta}|${limitePagina}`;
      if (callback.length <= 64) {
        replyMarkup = {
          inline_keyboard: [[
            { text: `🧾 VER LOS ${rows.length - limitePagina} RESTANTES`, callback_data: callback }
          ]]
        };
      }
    }

    out += `💰 TOTAL: ${formatearPesosReporte(total)}\n🧾 Movimientos: ${rows.length}`;
    return { texto: out, replyMarkup };
  }

  return { texto: `🔎 ${titulo} — ${periodo.etiqueta}\n\n💰 Total: ${formatearPesosReporte(total)}\n🧾 Movimientos: ${rows.length}` };
}

async function generarPaginaMovimientosPeriodo(env, chatId, desde, hasta, offset = 0) {
  if (!env.DB) return { texto: "⚠️ No está disponible la base de datos." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(desde || "")) || !/^\d{4}-\d{2}-\d{2}$/.test(String(hasta || ""))) {
    return { texto: "⚠️ El período solicitado no es válido." };
  }

  const pagina = Math.max(0, Number(offset) || 0);
  const limite = 20;
  try {
    const sql = `SELECT g.id AS gasto_id, g.fecha, g.created_at, i.concepto, i.detalle, i.monto, i.comercio, i.canal, i.persona, i.categoria, i.subcategoria, i.forma_pago
      FROM gastos g JOIN gasto_items i ON i.gasto_id=g.id
      WHERE g.chat_id=? AND g.estado='confirmado' AND g.fecha>=? AND g.fecha<=?
      ORDER BY g.fecha DESC, g.created_at DESC`;
    let rows = (await env.DB.prepare(sql).bind(String(chatId), desde, hasta).all()).results || [];
    // No deduplicar movimientos en reportes: cada gasto registrado debe aparecer y sumar.

    const total = rows.reduce((s, r) => s + Number(r.monto || 0), 0);
    if (pagina >= rows.length) {
      return { texto: "ℹ️ No hay más movimientos para mostrar." };
    }

    const seleccion = rows.slice(pagina, pagina + limite);
    let out = `🔎 MOVIMIENTOS — ${formatearFecha(desde)} al ${formatearFecha(hasta)}\n\n`;
    for (const r of seleccion) {
      const descripcion = descripcionParaReporte(r);
      out += `📅 ${formatearFecha(r.fecha)}\n• ${descripcion} — ${formatearPesosSimpleReporte(r.monto)}\n\n`;
    }

    const siguienteOffset = pagina + seleccion.length;
    const restantes = Math.max(0, rows.length - siguienteOffset);
    let replyMarkup = null;
    const filas = [];

    if (restantes > 0) {
      const callback = `repnext|${desde}|${hasta}|${siguienteOffset}`;
      if (callback.length <= 64) {
        filas.push([{ text: `🧾 VER LOS ${restantes} RESTANTES`, callback_data: callback }]);
      }
    }
    if (pagina > 0) {
      const anterior = Math.max(0, pagina - limite);
      const callback = `repnext|${desde}|${hasta}|${anterior}`;
      if (callback.length <= 64) {
        filas.push([{ text: "↩️ VER ANTERIORES", callback_data: callback }]);
      }
    }
    if (filas.length) replyMarkup = { inline_keyboard: filas };

    out += `💰 TOTAL DEL PERÍODO: ${formatearPesosReporte(total)}\n🧾 Movimientos: ${rows.length}\n📄 Mostrando: ${pagina + 1}-${pagina + seleccion.length}`;
    return { texto: out, replyMarkup };
  } catch (e) {
    console.log("ERROR PAGINA MOVIMIENTOS", e?.stack || e);
    return { texto: "⚠️ No pude mostrar los movimientos restantes." };
  }
}

function construirTituloConsultaIA(filtros, intencion) {
  if (filtros.comercio) return filtros.comercio.toUpperCase();
  if (filtros.concepto) return filtros.concepto.toUpperCase();
  if (filtros.subcategoria) return filtros.subcategoria.toUpperCase();
  if (filtros.categoria) return filtros.categoria.toUpperCase();
  if (filtros.persona) return filtros.persona.toUpperCase();
  if (filtros.canal) return filtros.canal.toUpperCase();
  if (filtros.forma_pago) return filtros.forma_pago.toUpperCase();
  return intencion === "BUSCAR_MOVIMIENTOS" ? "MOVIMIENTOS" : "GASTOS";
}

async function ejecutarResumenCategoriasIA(env, chatId, periodo) {
  try {
    const where = ["g.chat_id=?", "g.estado='confirmado'"];
    const binds = [String(chatId)];
    if (periodo.desde && periodo.hasta) {
      where.push("g.fecha>=?", "g.fecha<=?");
      binds.push(periodo.desde, periodo.hasta);
    }
    const sql = `SELECT i.categoria, SUM(i.monto) AS total, COUNT(DISTINCT g.id) AS movimientos FROM gastos g JOIN gasto_items i ON i.gasto_id=g.id WHERE ${where.join(" AND ")} GROUP BY i.categoria ORDER BY total DESC`;
    const rows = (await env.DB.prepare(sql).bind(...binds).all()).results || [];
    if (!rows.length) return { texto: `📊 RESUMEN DE GASTOS — ${periodo.etiqueta}\n\nNo encontré gastos confirmados en este período.` };
    const total = rows.reduce((s, r) => s + Number(r.total || 0), 0);
    let out = `📊 ¿EN QUÉ SE ME FUE LA PLATA? — ${periodo.etiqueta}\n\n`;
    for (const r of rows) out += `• ${r.categoria || "Sin categoría"}: ${formatearPesosReporte(r.total)} (${Number(r.movimientos || 0)} mov.)\n`;
    out += `\n💰 TOTAL: ${formatearPesosReporte(total)}`;
    return { texto: out };
  } catch (e) {
    console.log("ERROR RESUMEN CATEGORIAS IA", e?.stack || e);
    return "⚠️ No pude generar el resumen por categorías.";
  }
}

// ============================================================
// CONSULTAS DE REPORTES
// ============================================================

function extraerFechaDiaConsulta(t) {
  const texto = normalizar(String(t || ""));
  const meses = {
    enero:1, febrero:2, marzo:3, abril:4, mayo:5, junio:6, julio:7, agosto:8,
    septiembre:9, setiembre:9, octubre:10, noviembre:11, diciembre:12
  };
  const m = texto.match(/\b(\d{1,2})\s+(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+(?:de|del)\s+(20\d{2}))?\b/i);
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = meses[m[2].toLowerCase()];
  const anio = m[3] ? Number(m[3]) : Number(fechaLocalISO().slice(0,4));
  const fecha = `${anio}-${String(mes).padStart(2,"0")}-${String(dia).padStart(2,"0")}`;
  return fechaISOValida(fecha) ? fecha : null;
}

async function generarDetalleDia(env, chatId, fecha) {
  if (!env.DB) return "⚠️ No está disponible la base de datos.";
  try {
    const sql = `SELECT g.fecha, g.created_at, i.concepto, i.detalle, i.monto, i.comercio
      FROM gastos g JOIN gasto_items i ON i.gasto_id=g.id
      WHERE g.chat_id=? AND g.estado='confirmado' AND g.fecha=?
      ORDER BY g.created_at ASC`;
    let rows = (await env.DB.prepare(sql).bind(String(chatId), fecha).all()).results || [];
    // No deduplicar movimientos en reportes: cada gasto registrado debe aparecer y sumar.
    const total = rows.reduce((s,r) => s + Number(r.monto || 0), 0);
    if (!rows.length) return `🧾 COMPRAS — ${formatearFecha(fecha)}\n\nNo encontré gastos registrados para este día.`;
    let out = `🧾 COMPRAS — ${formatearFecha(fecha)}\n\n`;
    for (const r of rows) {
      const descripcion = descripcionParaReporte(r);
      out += `• ${descripcion} — ${formatearPesosSimpleReporte(r.monto)}\n`;
    }
    out += `\n💰 TOTAL: ${formatearPesosReporte(total)}\n🧾 Movimientos: ${rows.length}`;
    return out;
  } catch (e) {
    console.log("ERROR DETALLE DIA", e?.stack || e);
    return "⚠️ No pude mostrar los gastos de ese día.";
  }
}

function interpretarConsultaNatural(texto) {
  const t = normalizar(texto);

  // ----------------------------------------------------------
  // CONSULTA DE UN DÍA ESPECÍFICO
  // Ejemplos: "muéstrame las compras del 2 de septiembre",
  // "qué gastos hice el 2 de septiembre de 2026".
  // Se resuelve antes de la IA para que un día nunca termine convertido
  // accidentalmente en una consulta de todo el mes.
  // ----------------------------------------------------------
  const fechaDiaConsulta = extraerFechaDiaConsulta(t);
  if (fechaDiaConsulta && /\b(compras?|gastos?|movimientos?)\b/.test(t)) {
    return { tipo: "dia", fecha: fechaDiaConsulta };
  }

  // ----------------------------------------------------------
  // BUSQUEDA: comprobar si un gasto ya fue registrado.
  // Nunca crea un pendiente ni entra al flujo de registro.
  // ----------------------------------------------------------
  const esBusqueda =
    /\bya\s+registre\b/.test(t) ||
    /\bhe\s+registrado\b/.test(t) ||
    /\bhabia\s+registrado\b/.test(t);

  if (esBusqueda) return "buscar";

  // ----------------------------------------------------------
  // CONSULTA DE TOTAL: "cuanto gaste en X"
  // Primero detectamos la intención y luego extraemos X.
  // Esto evita que Amazon, MercadoLibre, veterinaria, etc.
  // sean confundidos con un gasto nuevo.
  // ----------------------------------------------------------
  const esCuanto =
    /\bcuanto\b/.test(t) &&
    ( /\bgast(?:e|aste)\b/.test(t) || /\bpague\b/.test(t) || /\bpag(?:ue|aste)\b/.test(t) );

  const esCuantas = /\bcuantas\b/.test(t);

  if (esCuantas && contiene(t, ["veces"]) && contiene(t, ["comer", "restaurante", "cena", "almuerzo"])) {
    return "restcount";
  }

  if (!esCuanto) return null;

  // Consultas específicas que ya tenemos en el menú.
  if (contiene(t, ["rappi"])) return "rappi";
  if (contiene(t, ["restaurante", "restaurantes", "salir a comer", "comer por fuera", "cena", "almuerzo"])) return "resttotal";
  if (contiene(t, ["mercado", "mercados"])) return "mercado";
  if (contiene(t, ["gastos del hogar", "gasto del hogar", "hogar"])) return "hogartotal";
  if (contiene(t, ["diana"])) return "dianatotal";
  if (contiene(t, ["tarjeta", "tc", "credito"])) return "tctotal";
  if (contiene(t, ["veterinaria", "veterinario"])) return "veterinaria";

  // Consulta genérica: "cuanto gaste en X".
  const sujeto = extraerSujetoConsulta(t);
  if (sujeto) return { tipo: "generica", sujeto };

  // No dejamos un estado pendiente. Simplemente indicamos cómo consultar.
  return "consulta_sin_sujeto";
}

function extraerSujetoConsulta(t) {
  let sujeto = String(t || "");

  // Quitar la pregunta completa y dejar principalmente lo que sigue a "en".
  const matchEn = sujeto.match(/\ben\s+(.+?)(?:\s+en\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)|\s+este\s+mes|\s+este\s+ano|\s+este\s+año|\s+del?\s+mes|\s*$)/i);
  if (matchEn) sujeto = matchEn[1];
  else {
    // Alternativa natural: "cuanto gaste de X".
    const matchDe = sujeto.match(/\bde\s+(.+?)(?:\s+en\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)|\s+este\s+mes|\s*$)/i);
    if (matchDe) sujeto = matchDe[1];
  }

  sujeto = sujeto
    .replace(/^.*?\bcuanto\b/, "")
    .replace(/\b(?:gaste|gasté|pague|pagué|pagaste|pagar|gasto|gastos)\b/g, " ")
    .replace(/\b(?:este|mes|ano|año|del|de|los|las|el|la|un|una|mis|mi|en)\b/g, " ")
    .replace(/\b(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/g, " ")
    .replace(/\b\d{1,2}\b/g, " ")
    .replace(/[¿?¡!.,;:()\[\]{}"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return sujeto.length >= 2 ? sujeto : null;
}

async function ejecutarConsultaReporte(env, chatId, consulta) {
  if (!env.DB) return "⚠️ No está disponible la base de datos.";
  const mes = fechaLocalISO().slice(0, 7);
  const numeroMes = Number(mes.slice(5, 7));
  const anio = mes.slice(0, 4);
  const nombre = nombreMes(numeroMes).toUpperCase();

  try {
    let sql = "";
    let label = "";
    let count = false;

    if (consulta === "resttotal") {
      sql = `SELECT COALESCE(SUM(i.monto),0) AS total, COUNT(DISTINCT g.id) AS movimientos FROM gastos g JOIN gasto_items i ON i.gasto_id=g.id WHERE g.chat_id=? AND g.estado='confirmado' AND substr(g.fecha,1,7)=? AND lower(i.categoria)=lower('Restaurantes y Rappi') AND lower(i.subcategoria)='salidas a comer por fuera restaurantes'`;
      label = "🍽️ RESTAURANTES";
    } else if (consulta === "restcount") {
      sql = `SELECT COUNT(DISTINCT g.id) AS total FROM gastos g JOIN gasto_items i ON i.gasto_id=g.id WHERE g.chat_id=? AND g.estado='confirmado' AND substr(g.fecha,1,7)=? AND lower(i.categoria)=lower('Restaurantes y Rappi') AND lower(i.subcategoria)='salidas a comer por fuera restaurantes'`;
      label = "🔢 SALIDAS A COMER";
      count = true;
    } else if (consulta === "rappi") {
      sql = `SELECT COALESCE(SUM(i.monto),0) AS total, COUNT(DISTINCT g.id) AS movimientos FROM gastos g JOIN gasto_items i ON i.gasto_id=g.id WHERE g.chat_id=? AND g.estado='confirmado' AND substr(g.fecha,1,7)=? AND (lower(trim(i.canal))='rappi' OR lower(coalesce(i.comercio,'')) LIKE '%rappi%' OR lower(coalesce(i.concepto,'')) LIKE '%rappi%' OR lower(coalesce(i.detalle,'')) LIKE '%rappi%')`;
      label = "📱 RAPPI";
    } else if (consulta === "mercado") {
      sql = `SELECT COALESCE(SUM(i.monto),0) AS total, COUNT(DISTINCT g.id) AS movimientos FROM gastos g JOIN gasto_items i ON i.gasto_id=g.id WHERE g.chat_id=? AND g.estado='confirmado' AND substr(g.fecha,1,7)=? AND lower(i.categoria)=lower('Hogar') AND lower(i.subcategoria)='mercado jumbo o mercaz'`;
      label = "🛒 MERCADO";
    } else if (consulta === "hogartotal") {
      sql = `SELECT COALESCE(SUM(i.monto),0) AS total, COUNT(DISTINCT g.id) AS movimientos FROM gastos g JOIN gasto_items i ON i.gasto_id=g.id WHERE g.chat_id=? AND g.estado='confirmado' AND substr(g.fecha,1,7)=? AND lower(i.categoria)=lower('Hogar')`;
      label = "🏠 HOGAR";
    } else if (consulta === "dianatotal") {
      sql = `SELECT COALESCE(SUM(i.monto),0) AS total, COUNT(DISTINCT g.id) AS movimientos FROM gastos g JOIN gasto_items i ON i.gasto_id=g.id WHERE g.chat_id=? AND g.estado='confirmado' AND substr(g.fecha,1,7)=? AND lower(trim(i.persona))='diana'`;
      label = "👤 GASTOS DE DIANA";
    } else if (consulta === "tctotal") {
      sql = `SELECT COALESCE(SUM(i.monto),0) AS total, COUNT(DISTINCT g.id) AS movimientos FROM gastos g JOIN gasto_items i ON i.gasto_id=g.id WHERE g.chat_id=? AND g.estado='confirmado' AND substr(g.fecha,1,7)=? AND lower(trim(i.forma_pago)) IN ('tc','tarjeta de credito','tarjeta de crédito','tarjeta credito','tarjeta crédito')`;
      label = "💳 PAGOS CON TARJETA";
    } else if (consulta === "veterinaria") {
      sql = `SELECT COALESCE(SUM(i.monto),0) AS total, COUNT(DISTINCT g.id) AS movimientos FROM gastos g JOIN gasto_items i ON i.gasto_id=g.id WHERE g.chat_id=? AND g.estado='confirmado' AND substr(g.fecha,1,7)=? AND lower(i.categoria)=lower('Gastos perla') AND lower(i.subcategoria)=lower('Veterinaria')`;
      label = "🐶 VETERINARIA";
    } else if (consulta === "consulta_sin_sujeto") {
      return "🔎 ¿Qué quieres consultar? Por ejemplo: ¿Cuánto gasté en Amazon?";
    } else if (consulta && consulta.tipo === "generica") {
      return await ejecutarConsultaGenerica(env, chatId, consulta.sujeto, mes, nombre, anio);
    } else {
      return "🔎 No entendí esa consulta. Puedes preguntarme, por ejemplo: ¿Cuánto gasté en restaurantes?";
    }

    const row = (await env.DB.prepare(sql).bind(String(chatId), mes).first()) || {};
    const valor = Number(row.total || 0);
    const movimientos = Number(row.movimientos || 0);

    // Todas las consultas con resultados muestran el mismo botón de detalle.
    // El detalle vuelve a consultar D1 usando un término de búsqueda equivalente
    // a la consulta, sin crear ningún estado pendiente.
    // El botón de detalle debe reutilizar exactamente el mismo criterio
    // que produjo el total. No usamos una búsqueda genérica para las
    // consultas predefinidas, porque podría mezclar categoría/subcategoría.
    const detalleCallback = [
      "resttotal", "restcount", "rappi", "mercado",
      "hogartotal", "dianatotal", "tctotal", "veterinaria"
    ].includes(consulta) ? `repdetq|${consulta}` : null;
    const replyMarkup = detalleCallback && detalleCallback.length <= 64 && movimientos > 0
      ? { inline_keyboard: [[{ text: `🧾 VER MOVIMIENTOS (${movimientos})`, callback_data: detalleCallback }]] }
      : null;

    if (count) {
      return {
        texto: `${label} — ${nombre} ${anio}\n\n🔢 Salidas: ${valor}`,
        replyMarkup
      };
    }

    return {
      texto: `${label} — ${nombre} ${anio}\n\n💰 Total: ${formatearPesosReporte(valor)}\n🧾 Movimientos: ${movimientos}`,
      replyMarkup
    };
  } catch (e) {
    console.log("ERROR CONSULTA REPORTE", e?.stack || e);
    return "⚠️ No pude realizar esa consulta.";
  }
}

function tokensBusquedaGasto(texto) {
  const limpio = normalizar(texto)
    .replace(/[¿?¡!.,;:()\[\]{}"']/g, " ")
    .replace(/\bya\s+registr(?:e|ado|aste|amos)\b/g, " ")
    .replace(/\bhabia\s+registrado\b/g, " ")
    .replace(/\bhe\s+registrado\b/g, " ")
    .replace(/\b(?:quiero|saber|si|que|cual|cuales|un|una|el|la|los|las|de|del|en|por|para|con|mi|mis|me|se|gasto|gastos|compra|compras|registrar|registre|registré|registrado|ya|habia|he|hoy|ayer|antier)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const base = limpio.split(" ").filter(w => w.length >= 3);
  const variantes = [];
  for (const w of base) {
    if (!variantes.includes(w)) variantes.push(w);
    if (w.endsWith("es") && w.length > 4) {
      const singular = w.slice(0, -2);
      if (singular.length >= 3 && !variantes.includes(singular)) variantes.push(singular);
    } else if (w.endsWith("s") && w.length > 4) {
      const singular = w.slice(0, -1);
      if (singular.length >= 3 && !variantes.includes(singular)) variantes.push(singular);
    }
  }
  return variantes.slice(0, 8);
}

function descripcionParaReporte(r) {
  const concepto = String(r?.concepto || "").trim();
  const detalle = String(r?.detalle || "").trim();
  // Para movimientos importados desde foto, si quedó el concepto genérico
  // "Compra en ...", mostramos el texto bancario como descripción.
  if (/^compra\s+en\s+/i.test(concepto) && detalle) return capitalizar(detalle);
  return capitalizar(concepto || detalle || "Gasto");
}

async function buscarGastoReporte(env, chatId, texto) {
  const palabras = tokensBusquedaGasto(texto);
  if (!palabras.length) return "🔎 No encontré qué gasto buscar.";

  try {
    const sql = `SELECT g.fecha, g.created_at, i.concepto, i.detalle, i.monto, i.comercio, i.persona, i.categoria, i.subcategoria
      FROM gastos g JOIN gasto_items i ON i.gasto_id=g.id
      WHERE g.chat_id=? AND g.estado='confirmado'
      ORDER BY g.fecha DESC, g.created_at DESC LIMIT 1000`;
    const rows = (await env.DB.prepare(sql).bind(String(chatId)).all()).results || [];

    const candidatos = rows.map(r => {
      const campos = [r.concepto, r.detalle, r.comercio, r.persona, r.categoria, r.subcategoria]
        .filter(Boolean).map(v => normalizar(String(v)));
      const textoFila = campos.join(" ");
      let puntos = 0;
      let coincidencias = 0;
      for (const palabra of palabras) {
        if (campos.some(c => new RegExp(`\\b${escaparRegex(palabra)}\\b`).test(c))) {
          puntos += 10;
          coincidencias++;
        } else if (campos.some(c => c.includes(palabra))) {
          puntos += 4;
          coincidencias++;
        }
      }
      return { ...r, puntos, coincidencias, textoFila };
    }).filter(r => r.coincidencias > 0);

    candidatos.sort((a, b) => b.puntos - a.puntos || String(b.fecha).localeCompare(String(a.fecha)));
    const top = candidatos.slice(0, 5);
    if (!top.length) return "🔎 No encontré un gasto parecido en tus registros.";

    let out = "🔎 GASTOS ENCONTRADOS";
    for (const r of top) {
      out += `\n\n📅 ${formatearFecha(r.fecha)}\n• ${descripcionParaReporte(r)} — ${formatearPesosSimpleReporte(r.monto)}`;
    }
    return out;
  } catch (e) {
    console.log("ERROR BUSQUEDA GASTO", e?.stack || e);
    return "⚠️ No pude buscar el gasto.";
  }
}

async function ejecutarConsultaGenerica(env, chatId, sujeto, mes, nombreMesActual, anio) {
  try {
    const sql = `SELECT g.fecha, i.concepto, i.detalle, i.monto, i.comercio, i.canal, i.persona, i.categoria, i.subcategoria, i.forma_pago
      FROM gastos g JOIN gasto_items i ON i.gasto_id=g.id
      WHERE g.chat_id=? AND g.estado='confirmado' AND substr(g.fecha,1,7)=?
      ORDER BY g.fecha DESC, g.created_at DESC`;

    let rows = (await env.DB.prepare(sql).bind(String(chatId), mes).all()).results || [];
    // No deduplicar movimientos en reportes: cada gasto registrado debe aparecer y sumar.
    const termino = normalizar(sujeto);
    const palabras = termino.split(/\s+/).filter(p => p.length >= 2);

    if (!palabras.length) return "🔎 No encontré qué consultar.";

    // REGLA DE CONSISTENCIA: cuando el usuario consulta una categoría o
    // subcategoría del catálogo, el total y el detalle deben usar exactamente
    // el mismo conjunto de movimientos. Se normalizan espacios alrededor de
    // '/' para incluir registros históricos como "Pagos varios/ Oscio".
    const categoriaObjetivo = CATALOGO_FALLBACK.categorias.find(c =>
      normalizarNombreReporte(c.nombre) === normalizarNombreReporte(sujeto)
    );
    const subcategoriaObjetivo = !categoriaObjetivo
      ? CATALOGO_FALLBACK.subcategorias.find(sc =>
          normalizarNombreReporte(sc.nombre) === normalizarNombreReporte(sujeto)
        )
      : null;

    const encontrados = rows.filter(r => {
      if (categoriaObjetivo) {
        return normalizarNombreReporte(r.categoria) === normalizarNombreReporte(categoriaObjetivo.nombre);
      }
      if (subcategoriaObjetivo) {
        return normalizarNombreReporte(r.subcategoria) === normalizarNombreReporte(subcategoriaObjetivo.nombre);
      }

      // Para consultas que no son categoría/subcategoría seguimos buscando
      // únicamente en los datos propios del movimiento.
      const campos = [r.concepto, r.detalle, r.comercio, r.canal]
        .filter(Boolean).map(v => normalizar(String(v)));
      const textoFila = campos.join(" ");
      return palabras.every(p => textoFila.includes(p));
    });

    const total = encontrados.reduce((s, r) => s + Number(r.monto || 0), 0);
    const titulo = (categoriaObjetivo?.nombre || subcategoriaObjetivo?.nombre || sujeto).toUpperCase();

    if (!encontrados.length) {
      return `🔎 ${titulo} — ${nombreMesActual.toUpperCase()} ${anio}\n\n💰 Total: ${formatearPesosReporte(0)}\n\nNo encontré movimientos que coincidan con "${sujeto}".`;
    }

    // Conservamos también el período para que el detalle consulte exactamente
    // el mismo mes que produjo el total (y no el mes actual).
    const detalleCallback = `repdet|${encodeURIComponent(categoriaObjetivo?.nombre || subcategoriaObjetivo?.nombre || sujeto)}|${mes}`;
    const replyMarkup = detalleCallback.length <= 64
      ? { inline_keyboard: [[{ text: `🧾 VER MOVIMIENTOS (${encontrados.length})`, callback_data: detalleCallback }]] }
      : null;

    return {
      texto: `🔎 ${titulo} — ${nombreMesActual.toUpperCase()} ${anio}\n\n💰 Total: ${formatearPesosReporte(total)}\n🧾 Movimientos: ${encontrados.length}`,
      replyMarkup
    };
  } catch (e) {
    console.log("ERROR CONSULTA GENERICA", e?.stack || e);
    return "⚠️ No pude realizar esa consulta.";
  }
}

async function detalleConsultaPredefinida(env, chatId, consulta) {
  const mes = fechaLocalISO().slice(0, 7);
  const config = {
    resttotal: { titulo: "🍽️ RESTAURANTES", where: `lower(i.categoria)=lower('Restaurantes y Rappi') AND lower(i.subcategoria)=lower('salidas a comer por fuera restaurantes')` },
    restcount: { titulo: "🍽️ RESTAURANTES", where: `lower(i.categoria)=lower('Restaurantes y Rappi') AND lower(i.subcategoria)=lower('salidas a comer por fuera restaurantes')` },
    rappi: { titulo: "📱 RAPPI", where: `(lower(trim(i.canal))='rappi' OR lower(coalesce(i.comercio,'')) LIKE '%rappi%' OR lower(coalesce(i.concepto,'')) LIKE '%rappi%' OR lower(coalesce(i.detalle,'')) LIKE '%rappi%')` },
    mercado: { titulo: "🛒 MERCADO", where: `lower(i.categoria)=lower('Hogar') AND lower(i.subcategoria)=lower('mercado jumbo o mercaz')` },
    hogartotal: { titulo: "🏠 HOGAR", where: `lower(i.categoria)=lower('Hogar')` },
    dianatotal: { titulo: "👤 GASTOS DE DIANA", where: `lower(trim(i.persona))='diana'` },
    tctotal: { titulo: "💳 PAGOS CON TARJETA", where: `lower(trim(i.forma_pago)) IN ('tc','tarjeta de credito','tarjeta de crédito','tarjeta credito','tarjeta crédito')` },
    veterinaria: { titulo: "🐶 VETERINARIA", where: `lower(i.categoria)=lower('Gastos perla') AND lower(i.subcategoria)=lower('Veterinaria')` }
  };
  const cfg = config[consulta];
  if (!cfg) return "⚠️ No pude mostrar el detalle de esta consulta.";

  try {
    const sql = `SELECT g.fecha, g.created_at, i.concepto, i.detalle, i.monto, i.comercio
      FROM gastos g JOIN gasto_items i ON i.gasto_id=g.id
      WHERE g.chat_id=? AND g.estado='confirmado' AND substr(g.fecha,1,7)=? AND ${cfg.where}
      ORDER BY g.fecha ASC, g.created_at ASC`;
    let rows = (await env.DB.prepare(sql).bind(String(chatId), mes).all()).results || [];
    // No deduplicar movimientos en reportes: cada gasto registrado debe aparecer y sumar.
    const nombre = nombreMes(Number(mes.slice(5, 7))).toUpperCase();
    const anio = mes.slice(0, 4);
    const total = rows.reduce((s, r) => s + Number(r.monto || 0), 0);

    if (!rows.length) {
      return `${cfg.titulo} — ${nombre} ${anio}\n\n💰 Total: ${formatearPesosReporte(0)}\n\nNo encontré movimientos.`;
    }

    let out = `🧾 ${cfg.titulo.replace(/^\S+\s*/, "")} — ${nombre} ${anio}\n\n`;
    for (const r of rows) {
      const descripcion = descripcionParaReporte(r);
      out += `📅 ${formatearFecha(r.fecha)}\n• ${descripcion} — ${formatearPesosSimpleReporte(r.monto)}\n\n`;
    }
    out += `💰 TOTAL: ${formatearPesosReporte(total)}`;
    return out;
  } catch (e) {
    console.log("ERROR DETALLE CONSULTA PREDEFINIDA", e?.stack || e);
    return "⚠️ No pude mostrar el detalle de esta consulta.";
  }
}

async function detalleConsultaGenerica(env, chatId, sujeto, periodoMes = null) {
  try {
    const mes = /^\d{4}-\d{2}$/.test(String(periodoMes || "")) ? String(periodoMes) : fechaLocalISO().slice(0, 7);
    const sql = `SELECT g.fecha, i.concepto, i.detalle, i.monto, i.comercio, i.canal, i.persona, i.categoria, i.subcategoria, i.forma_pago
      FROM gastos g JOIN gasto_items i ON i.gasto_id=g.id
      WHERE g.chat_id=? AND g.estado='confirmado' AND substr(g.fecha,1,7)=?
      ORDER BY g.fecha ASC, g.created_at ASC`;

    let rows = (await env.DB.prepare(sql).bind(String(chatId), mes).all()).results || [];
    // No deduplicar movimientos en reportes: cada gasto registrado debe aparecer y sumar.
    const termino = normalizar(String(sujeto || ""));
    const palabras = termino.split(/\s+/).filter(p => p.length >= 2);

    const categoriaObjetivo = CATALOGO_FALLBACK.categorias.find(c =>
      normalizarNombreReporte(c.nombre) === normalizarNombreReporte(sujeto)
    );
    const subcategoriaObjetivo = !categoriaObjetivo
      ? CATALOGO_FALLBACK.subcategorias.find(sc =>
          normalizarNombreReporte(sc.nombre) === normalizarNombreReporte(sujeto)
        )
      : null;

    const encontrados = rows.filter(r => {
      if (categoriaObjetivo) {
        return normalizarNombreReporte(r.categoria) === normalizarNombreReporte(categoriaObjetivo.nombre);
      }
      if (subcategoriaObjetivo) {
        return normalizarNombreReporte(r.subcategoria) === normalizarNombreReporte(subcategoriaObjetivo.nombre);
      }

      const campos = [r.concepto, r.detalle, r.comercio, r.canal]
        .filter(Boolean).map(v => normalizar(String(v)));
      const textoFila = campos.join(" ");
      return palabras.every(p => textoFila.includes(p));
    });

    const total = encontrados.reduce((s, r) => s + Number(r.monto || 0), 0);
    const nombre = nombreMes(Number(mes.slice(5, 7))).toUpperCase();
    const anio = mes.slice(0, 4);
    const titulo = (categoriaObjetivo?.nombre || subcategoriaObjetivo?.nombre || sujeto || "CONSULTA").toUpperCase();

    if (!encontrados.length) {
      return `🔎 ${titulo} — ${nombre} ${anio}\n\n💰 Total: ${formatearPesosReporte(0)}\n\nNo encontré movimientos que coincidan con "${sujeto}".`;
    }

    let out = `🧾 ${titulo} — ${nombre} ${anio}\n\n`;
    for (const r of encontrados) {
      const descripcion = descripcionParaReporte(r);
      out += `📅 ${formatearFecha(r.fecha)}\n• ${descripcion} — ${formatearPesosSimpleReporte(r.monto)}\n\n`;
    }
    out += `💰 TOTAL: ${formatearPesosReporte(total)}`;
    return out;
  } catch (e) {
    console.log("ERROR DETALLE CONSULTA", e?.stack || e);
    return "⚠️ No pude mostrar el detalle de esta consulta.";
  }
}

// ============================================================
// MENÚS DE REPORTES
// ============================================================

function interpretarComandoDelete(texto) {
  const t = normalizar(String(texto || "")).replace(/\s+/g, " ").trim();

  if (t === "/delete" || t === "delete") {
    return { tipo: "confirmar", fecha: fechaLocalISO() };
  }

  if (!t.startsWith("/delete ") && !t.startsWith("delete ")) return null;

  const argumento = t.replace(/^\/?delete\s+/, "").trim();
  if (!argumento) return { tipo: "confirmar", fecha: fechaLocalISO() };

  const hoy = fechaLocalISO();

  if (argumento === "hoy") {
    return { tipo: "confirmar", fecha: hoy };
  }

  if (argumento === "ayer") {
    return { tipo: "confirmar", fecha: restarDiasISO(hoy, 1) };
  }

  // YYYY-MM-DD
  let m = argumento.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const fecha = `${m[1]}-${String(m[2]).padStart(2,"0")}-${String(m[3]).padStart(2,"0")}`;
    return fechaISOValida(fecha) ? { tipo: "confirmar", fecha } : { tipo: "ayuda" };
  }

  // DD/MM/YYYY o DD-MM-YYYY
  m = argumento.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (m) {
    const fecha = `${m[3]}-${String(m[2]).padStart(2,"0")}-${String(m[1]).padStart(2,"0")}`;
    return fechaISOValida(fecha) ? { tipo: "confirmar", fecha } : { tipo: "ayuda" };
  }

  // "5 agosto 2026" / "5 agosto" / "agosto 5 2026"
  const meses = {
    enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
    julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10,
    noviembre: 11, diciembre: 12
  };

  let mm = argumento.match(/^(\d{1,2})\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+(20\d{2}))?$/);
  if (mm) {
    const anio = Number(mm[3] || hoy.slice(0,4));
    const fecha = `${anio}-${String(meses[mm[2]]).padStart(2,"0")}-${String(mm[1]).padStart(2,"0")}`;
    return fechaISOValida(fecha) ? { tipo: "confirmar", fecha } : { tipo: "ayuda" };
  }

  mm = argumento.match(/^(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+(\d{1,2})(?:\s+(20\d{2}))?$/);
  if (mm) {
    const anio = Number(mm[3] || hoy.slice(0,4));
    const fecha = `${anio}-${String(meses[mm[1]]).padStart(2,"0")}-${String(mm[2]).padStart(2,"0")}`;
    return fechaISOValida(fecha) ? { tipo: "confirmar", fecha } : { tipo: "ayuda" };
  }

  return { tipo: "ayuda" };
}

function fechaISOValida(fecha) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const d = new Date(`${fecha}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10) === fecha;
}

async function prepararBorradoDia(env, chatId, fecha) {
  if (!env.DB) throw new Error("Falta binding D1: DB");

  const sql = `
    SELECT
      COUNT(DISTINCT g.id) AS cantidad,
      COALESCE(SUM(CASE
        WHEN i.gasto_id IS NOT NULL THEN i.monto
        ELSE g.monto_total
      END), 0) AS total_items
    FROM gastos g
    LEFT JOIN gasto_items i ON i.gasto_id = g.id
    WHERE g.chat_id = ?
      AND g.fecha = ?
      AND g.estado = 'confirmado'
  `;

  // Para el total mostramos el total de los gastos, no la suma repetida de
  // sus múltiples items.
  const gastos = (await env.DB.prepare(`
    SELECT id, monto_total
    FROM gastos
    WHERE chat_id=? AND fecha=? AND estado='confirmado'
    ORDER BY created_at ASC
  `).bind(String(chatId), fecha).all()).results || [];

  return {
    cantidad: gastos.length,
    total: gastos.reduce((s, g) => s + Number(g.monto_total || 0), 0)
  };
}

async function borrarGastosDia(env, chatId, fecha) {
  if (!env.DB) throw new Error("Falta binding D1: DB");

  const gastos = (await env.DB.prepare(`
    SELECT id, monto_total
    FROM gastos
    WHERE chat_id=? AND fecha=? AND estado='confirmado'
  `).bind(String(chatId), fecha).all()).results || [];

  if (!gastos.length) return { cantidad: 0, total: 0 };

  const statements = [];

  // Primero los items y luego los encabezados, para respetar la relación
  // gasto_items -> gastos incluso si D1 tiene foreign keys activas.
  statements.push(env.DB.prepare(`
    DELETE FROM gasto_items
    WHERE gasto_id IN (
      SELECT id FROM gastos
      WHERE chat_id=? AND fecha=? AND estado='confirmado'
    )
  `).bind(String(chatId), fecha));

  statements.push(env.DB.prepare(`
    DELETE FROM gastos
    WHERE chat_id=? AND fecha=? AND estado='confirmado'
  `).bind(String(chatId), fecha));

  if (typeof env.DB.batch === "function") {
    await env.DB.batch(statements);
  } else {
    for (const statement of statements) await statement.run();
  }

  return {
    cantidad: gastos.length,
    total: gastos.reduce((s, g) => s + Number(g.monto_total || 0), 0)
  };
}

async function obtenerPendienteFotoPorId(env, id, chatId) {
  if (!env.DB) return null;
  return await env.DB.prepare(`
    SELECT * FROM pendientes
    WHERE id = ? AND chat_id = ?
      AND estado IN ('foto_pendiente', 'foto_descripcion')
    LIMIT 1
  `).bind(id, String(chatId)).first();
}

async function obtenerPendienteFotoDescripcion(env, chatId) {
  if (!env.DB) return null;
  return await env.DB.prepare(`
    SELECT * FROM pendientes
    WHERE chat_id = ? AND estado = 'foto_descripcion'
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(String(chatId)).first();
}

async function obtenerSiguientePendienteFoto(env, chatId) {
  if (!env.DB) return null;
  return await env.DB.prepare(`
    SELECT * FROM pendientes
    WHERE chat_id = ? AND estado IN ('foto_pendiente', 'foto_descripcion')
    ORDER BY created_at ASC
    LIMIT 1
  `).bind(String(chatId)).first();
}

async function contarPendientesFoto(env, chatId) {
  if (!env.DB) return 0;
  const r = await env.DB.prepare(`
    SELECT COUNT(*) AS total FROM pendientes
    WHERE chat_id = ? AND estado IN ('foto_pendiente', 'foto_descripcion')
  `).bind(String(chatId)).first();
  return Number(r?.total || 0);
}

function botonesPendienteFoto(pendingId) {
  return {
    inline_keyboard: [
      [
        { text: "✏️ AGREGAR DESCRIPCIÓN", callback_data: `photo_desc|${pendingId}` }
      ],
      [
        { text: "📂 CORREGIR CATEGORÍA", callback_data: `corr_cat_menu|${pendingId}` }
      ],
      [
        { text: "✅ VALIDAR Y GUARDAR", callback_data: `photo_save|${pendingId}` },
        { text: "❌ DENEGAR", callback_data: `photo_deny|${pendingId}` }
      ]
    ]
  };
}

function crearTarjetaPendienteFoto(resultado) {
  const m = resultado?.movimientos?.[0] || {};
  const descripcionUsuario = resultado?._descripcion_usuario || "";
  const banco = resultado?._descripcion_banco || m.detalle || "";
  let out = "📥 COMPRA PENDIENTE POR VALIDAR\n\n";
  out += `📅 ${formatearFecha(resultado.fecha)}\n`;
  out += `💰 ${formatearPesos(resultado.monto)}\n`;
  out += `🏪 ${m.comercio || "Comercio no identificado"}\n`;
  if (m.forma_pago) out += `💳 ${m.forma_pago}\n`;
  if (descripcionUsuario) out += `📝 Descripción: ${descripcionUsuario}\n`;
  else out += `📝 Descripción: (sin agregar)\n`;
  if (m.categoria && m.subcategoria) out += `📂 ${m.categoria} → ${m.subcategoria}\n`;
  else out += `📂 Clasificación: pendiente de revisar\n`;
  if (resultado?._posible_duplicado) {
    const tipo = resultado._duplicado_tipo === "fuerte"
      ? "fecha + monto + comercio"
      : "fecha + monto";
    out += `\n⚠️ POSIBLE GASTO REPETIDO\n`;
    out += `Coincide por ${tipo}.\n`;
    if (Number(resultado._duplicado_confirmados || 0)) {
      out += `💾 Ya guardado en gastos: ${resultado._duplicado_confirmados}\n`;
    }
    if (Number(resultado._duplicado_pendientes || 0)) {
      out += `📥 Ya pendiente por validar: ${resultado._duplicado_pendientes}\n`;
    }

    const detalles = Array.isArray(resultado._duplicados_detalle) ? resultado._duplicados_detalle : [];
    if (detalles.length) {
      out += `\n🔎 Coincidencias encontradas:\n`;
      detalles.slice(0, 5).forEach((d, idx) => {
        const origen = d.fuente === "gasto_confirmado" ? "💾 Guardado" : "📥 Pendiente";
        const nombre = d.concepto || d.comercio || "Sin descripción";
        out += `${idx + 1}. ${origen} · ${formatearFecha(d.fecha)} · ${formatearPesos(d.monto)}\n`;
        out += `   🏪 ${d.comercio || "Comercio no identificado"}\n`;
        out += `   📝 ${nombre}\n`;
        if (d.categoria || d.subcategoria) out += `   📂 ${d.categoria || ""}${d.subcategoria ? ` → ${d.subcategoria}` : ""}\n`;
      });
    } else if (resultado._duplicado_ejemplo) {
      out += `Existente: ${resultado._duplicado_ejemplo}\n`;
    }
    out += `\n⚠️ El aviso NO bloquea la compra. Tú decides si guardarla o denegarla.`;
  }
  if (banco) out += `\n🧾 Banco: ${banco}\n`;
  out += "\n¿Qué quieres hacer con esta compra?";
  return out;
}

async function mostrarPendienteFoto(env, chatId, pendingId) {
  const pendiente = await obtenerPendienteFotoPorId(env, pendingId, chatId);
  if (!pendiente) {
    await enviarTelegram(env, chatId, "ℹ️ Esta compra ya no está pendiente.");
    return;
  }
  let resultado;
  try { resultado = JSON.parse(pendiente.interpretacion_json || "{}"); }
  catch { await enviarTelegram(env, chatId, "⚠️ No pude leer esta compra pendiente."); return; }

  // Recalcular aquí la alerta para que también detecte un gasto que se confirmó
  // DESPUÉS de que la foto fue importada, y para que agregar una descripción
  // nunca elimine la detección basada en fecha + monto.
  const actualizado = await refrescarAlertaDuplicadoPendienteFoto(env, chatId, pendiente);
  if (actualizado) resultado = actualizado;

  const total = await contarPendientesFoto(env, chatId);
  await enviarTelegram(
    env,
    chatId,
    `${crearTarjetaPendienteFoto(resultado)}\n\n📥 Pendientes restantes: ${total}`,
    botonesPendienteFoto(pendingId)
  );
}

async function mostrarSiguientePendienteFotoOFin(env, chatId) {
  const siguiente = await obtenerSiguientePendienteFoto(env, chatId);
  if (siguiente) {
    await mostrarPendienteFoto(env, chatId, siguiente.id);
  } else {
    await enviarTelegram(env, chatId, "🎉 No tienes más compras pendientes por validar.", await menuInicio(env, chatId));
  }
}


function normalizarComercioDuplicado(valor) {
  return normalizar(String(valor || "")).replace(/[^a-z0-9]+/g, " ").trim();
}

async function buscarPosibleDuplicadoFoto(env, chatId, resultado, fileId, excluirPendingId = null) {
  // Alerta informativa: una coincidencia NUNCA bloquea la creación del pendiente.
  // Comparamos por fecha + monto. El comercio aumenta la fuerza de la coincidencia,
  // pero nunca es requisito.
  try {
    if (!env.DB) return null;
    const fecha = normalizarFechaRegistro(resultado?.fecha) || resultado?.fecha;
    const monto = Number(resultado?.monto || 0);
    if (!fecha || !monto) return null;

    const comercioNuevo = normalizarComercioDuplicado(
      resultado?.comercio || resultado?.movimientos?.[0]?.comercio || ""
    );

    const gastos = (await env.DB.prepare(`
      SELECT g.id, g.fecha, g.monto_total, i.comercio, i.concepto, i.detalle,
             i.categoria, i.subcategoria
      FROM gastos g
      LEFT JOIN gasto_items i ON i.gasto_id = g.id
      WHERE g.chat_id = ? AND g.estado = 'confirmado'
      ORDER BY g.created_at DESC
      LIMIT 500
    `).bind(String(chatId)).all()).results || [];

    const pendientes = (await env.DB.prepare(`
      SELECT id, interpretacion_json, mensaje_original, created_at
      FROM pendientes
      WHERE chat_id = ?
        AND estado IN ('foto_pendiente', 'foto_descripcion')
      ORDER BY created_at DESC
      LIMIT 500
    `).bind(String(chatId)).all()).results || [];

    const candidatos = [];

    for (const g of gastos) {
      const f = normalizarFechaRegistro(g?.fecha) || g?.fecha;
      const m = Number(g?.monto_total || 0);
      if (f === fecha && m === monto) {
        candidatos.push({
          fuente: "gasto_confirmado",
          id: g.id,
          fecha: f,
          monto: m,
          comercio: g?.comercio || "",
          concepto: g?.concepto || "",
          detalle: g?.detalle || "",
          categoria: g?.categoria || "",
          subcategoria: g?.subcategoria || ""
        });
      }
    }

    for (const p of pendientes) {
      if (excluirPendingId && String(p.id) === String(excluirPendingId)) continue;
      try {
        const r = JSON.parse(p.interpretacion_json || "{}");
        const f = normalizarFechaRegistro(r?.fecha) || r?.fecha;
        const m = Number(r?.monto || 0);
        if (f === fecha && m === monto) {
          const item = r?.movimientos?.[0] || {};
          candidatos.push({
            fuente: "pendiente",
            id: p.id,
            fecha: f,
            monto: m,
            comercio: r?.comercio || item?.comercio || "",
            concepto: r?._descripcion_usuario || item?.concepto || "",
            detalle: r?._descripcion_banco || item?.detalle || "",
            categoria: r?.categoria || item?.categoria || "",
            subcategoria: r?.subcategoria || item?.subcategoria || ""
          });
        }
      } catch (_) {}
    }

    if (!candidatos.length) return null;

    const mismoComercio = comercioNuevo && candidatos.find(c => {
      const comercioExistente = normalizarComercioDuplicado(c?.comercio || "");
      return comercioExistente && (
        comercioExistente === comercioNuevo ||
        comercioExistente.includes(comercioNuevo) ||
        comercioNuevo.includes(comercioExistente)
      );
    });

    const coincidencias = candidatos.slice(0, 10).map(c => ({
      fuente: c.fuente,
      id: c.id,
      fecha: c.fecha,
      monto: c.monto,
      comercio: c.comercio || "Comercio no identificado",
      concepto: c.concepto || "",
      detalle: c.detalle || "",
      categoria: c.categoria || "",
      subcategoria: c.subcategoria || ""
    }));

    return {
      tipo: mismoComercio ? "fuerte" : "basico",
      cantidad: candidatos.length,
      cantidadConfirmados: candidatos.filter(c => c.fuente === "gasto_confirmado").length,
      cantidadPendientes: candidatos.filter(c => c.fuente === "pendiente").length,
      ejemplo: `${formatearFecha(fecha)} · ${formatearPesos(monto)} · ${mismoComercio?.comercio || candidatos[0]?.comercio || "comercio no identificado"}`,
      coincidencias
    };
  } catch (error) {
    console.error("Error comprobando posible duplicado de foto:", error?.message || error);
    return null;
  }
}

async function refrescarAlertaDuplicadoPendienteFoto(env, chatId, pendiente) {
  try {
    if (!pendiente?.id) return null;
    const resultado = JSON.parse(pendiente.interpretacion_json || "{}");
    const posible = await buscarPosibleDuplicadoFoto(
      env,
      chatId,
      resultado,
      resultado?._telegram_file_id || "",
      pendiente.id
    );

    if (posible) {
      resultado._posible_duplicado = true;
      resultado._duplicado_tipo = posible.tipo;
      resultado._duplicado_cantidad = posible.cantidad;
      resultado._duplicado_confirmados = posible.cantidadConfirmados;
      resultado._duplicado_pendientes = posible.cantidadPendientes;
      resultado._duplicado_ejemplo = posible.ejemplo;
      resultado._duplicados_detalle = posible.coincidencias || [];
    } else {
      resultado._posible_duplicado = false;
      delete resultado._duplicado_tipo;
      delete resultado._duplicado_cantidad;
      delete resultado._duplicado_confirmados;
      delete resultado._duplicado_pendientes;
      delete resultado._duplicado_ejemplo;
      delete resultado._duplicados_detalle;
    }

    await env.DB.prepare(`
      UPDATE pendientes SET interpretacion_json = ?, updated_at = datetime('now')
      WHERE id = ? AND chat_id = ?
    `).bind(JSON.stringify(resultado), pendiente.id, String(chatId)).run();

    return resultado;
  } catch (error) {
    console.error("Error refrescando alerta de duplicado:", error?.message || error);
    return null;
  }
}

async function crearPendientesDesdeFoto(env, chatId, message, resultadoFoto) {
  const movimientos = Array.isArray(resultadoFoto?.resultado?.movimientos)
    ? resultadoFoto.resultado.movimientos
    : [];
  const foto = Array.isArray(message?.photo) && message.photo.length ? message.photo[message.photo.length - 1] : null;
  const fileId = foto?.file_id || crypto.randomUUID();
  let creados = 0;
  let omitidosInvalidos = 0;
  let posiblesRepetidos = 0;
  let coincidenciasConfirmadas = 0;
  let coincidenciasPendientes = 0;

  for (let i = 0; i < movimientos.length; i++) {
    const m = movimientos[i];
    const formatoFoto = resultadoFoto?.resultado?.formato_monetario || m.formato_monetario || "DESCONOCIDO";
    const montoDesdeTexto = m.monto_texto ? parsearMontoImagen(m.monto_texto, formatoFoto) : 0;
    const monto = montoDesdeTexto || Number(m.monto || 0);
    if (!monto || !m.fecha) {
      omitidosInvalidos++;
      continue;
    }

    const fechaNormalizada = normalizarFechaRegistro(m.fecha);
    if (!fechaNormalizada) {
      omitidosInvalidos++;
      continue;
    }

    const descripcionBanco = m.descripcion_banco || "";
    const mensajeOriginal = `[FOTO_BANCO:${fileId}:${i}] ${descripcionBanco}`;

    // IMPORTANTE: no se usa mensajeOriginal para descartar un movimiento.
    // Si la foto se vuelve a enviar, TODOS sus movimientos vuelven a quedar
    // disponibles para revisión y el usuario decide guardar o denegar.
    // La clasificación de una foto bancaria debe usar también el texto real
    // de la transacción (comercio + descripción bancaria), no solo el monto y
    // el comercio. Esto permite reconocer desde el primer momento casos como
    // Rappi, MercadoLibre y Netflix aunque el comercio venga pegado o con OCR
    // imperfecto (ej. "PagoMERCADOLI", "DLONetflixcom").
    const textoClasificacionFoto = [
      m.comercio || "",
      m.descripcion_banco || ""
    ].filter(Boolean).join(" ").trim();

    const base = interpretarGasto(
      `compra por ${monto} en ${textoClasificacionFoto || "comercio"}`
    );
    let resultado = await aplicarAprendizajes(env, chatId, base);
    // Siempre guardamos fechas de banco en ISO YYYY-MM-DD. Si la captura
    // solo muestra "9 de agosto" se asume el año actual de Colombia.
    resultado.fecha = fechaNormalizada;
    resultado.monto = monto;
    resultado.moneda = "COP";
    resultado.banco_perfil = resultadoFoto?.resultado?.banco_perfil || resultadoFoto?.resultado?.banco_detectado || null;
    resultado.formato_monetario = resultadoFoto?.resultado?.formato_monetario || null;
    resultado.tipo = "gasto";
    resultado.mensaje_original = mensajeOriginal;
    resultado.comercio = m.comercio || null;
    resultado.forma_pago = m.tarjeta_ultimos4 ? `TC ****${String(m.tarjeta_ultimos4).replace(/\D/g, "")}` : null;
    resultado.persona = null;
    resultado.periodicidad = null;
    resultado._fuente = "foto_banco";
    resultado._telegram_file_id = fileId;
    resultado._foto_movimiento_index = i;
    resultado._descripcion_banco = descripcionBanco;
    resultado._descripcion_usuario = "";
    resultado.movimientos = Array.isArray(resultado.movimientos) && resultado.movimientos.length ? resultado.movimientos : [{}];
    const item = resultado.movimientos[0];
    item.concepto = m.comercio ? `Compra en ${m.comercio}` : "Compra bancaria";
    item.detalle = descripcionBanco;
    item.monto = monto;
    item.comercio = m.comercio || null;
    item.forma_pago = resultado.forma_pago;
    item.persona = null;
    resultado.categoria = item.categoria || null;
    resultado.subcategoria = item.subcategoria || null;
    resultado.confianza_categoria = item.confianza || "media";
    resultado.estado = (!item.categoria || !item.subcategoria) ? "requiere_revision" : "pendiente";

    // Una coincidencia SOLO genera una alerta. El pendiente siempre se crea.
    const posibleDuplicado = await buscarPosibleDuplicadoFoto(env, chatId, resultado, fileId);
    if (posibleDuplicado) {
      resultado._posible_duplicado = true;
      resultado._duplicado_tipo = posibleDuplicado.tipo;
      resultado._duplicado_cantidad = posibleDuplicado.cantidad;
      resultado._duplicado_confirmados = posibleDuplicado.cantidadConfirmados;
      resultado._duplicado_pendientes = posibleDuplicado.cantidadPendientes;
      resultado._duplicado_ejemplo = posibleDuplicado.ejemplo;
      resultado._duplicados_detalle = posibleDuplicado.coincidencias || [];
      posiblesRepetidos++;
      coincidenciasConfirmadas += posibleDuplicado.cantidadConfirmados;
      coincidenciasPendientes += posibleDuplicado.cantidadPendientes;
    } else {
      resultado._posible_duplicado = false;
    }

    await guardarPendiente(env, crypto.randomUUID(), chatId, mensajeOriginal, resultado, false, "foto_pendiente");
    creados++;
  }

  const totalPendientes = await contarPendientesFoto(env, chatId);
  let texto = `📸 PROCESAMIENTO DE FOTO\n\n`;
  texto += `🔎 Movimientos negativos detectados: ${movimientos.length}\n`;
  texto += `📥 Nuevos pendientes creados: ${creados}\n`;
  if (posiblesRepetidos) {
    texto += `⚠️ Con coincidencia existente: ${posiblesRepetidos}\n`;
    texto += `   • Gastos ya guardados coincidentes: ${coincidenciasConfirmadas}\n`;
    texto += `   • Pendientes coincidentes: ${coincidenciasPendientes}\n`;
  }
  if (omitidosInvalidos) texto += `⏭️ Omitidos por datos inválidos: ${omitidosInvalidos}\n`;
  texto += `\n📥 Total pendientes por validar: ${totalPendientes}`;
  texto += `\n\nℹ️ Los repetidos NO se descartan: quedan pendientes para que tú decidas si guardarlos o denegarlos.`;
  if (resultadoFoto?.usage) texto += `\n${formatearInfoIA({ usage: resultadoFoto.usage })}`;

  const siguiente = await obtenerSiguientePendienteFoto(env, chatId);
  return {
    texto,
    replyMarkup: siguiente ? { inline_keyboard: [[{ text: "📥 REVISAR PENDIENTES", callback_data: "foto|menu" }]] } : null
  };
}

function menuReportes() {
  return {
    inline_keyboard: [
      [
        { text: "📅 /dia — Hoy", callback_data: "rep|dia" },
        { text: "📊 /mes — Mes", callback_data: "rep|mes" }
      ],
      [
        { text: "📂 /mes detallado", callback_data: "rep|mesdet" },
        { text: "📋 /detalle", callback_data: "rep|detalle" }
      ],
      [
        { text: "🔎 CONSULTAS", callback_data: "rep|consultas" }
      ]
    ]
  };
}

function menuConsultas() {
  return {
    inline_keyboard: [
      [
        { text: "🍽️ Restaurantes", callback_data: "repq|rest" },
        { text: "🛒 Mercado / Hogar", callback_data: "repq|hogar" }
      ],
      [
        { text: "👤 Gastos de Diana", callback_data: "repq|diana" },
        { text: "💳 Pagos con tarjeta", callback_data: "repq|tc" }
      ],
      [
        { text: "↩️ Volver a reportes", callback_data: "rep|menu" }
      ]
    ]
  };
}

function menuConsultaRestaurantes() {
  return {
    inline_keyboard: [
      [{ text: "💰 ¿Cuánto gasté en restaurantes este mes?", callback_data: "repq|resttotal" }],
      [{ text: "🔢 ¿Cuántas veces salí a comer?", callback_data: "repq|restcount" }],
      [{ text: "📱 ¿Cuánto gasté en Rappi?", callback_data: "repq|rappi" }],
      [{ text: "↩️ Volver a consultas", callback_data: "rep|consultas" }]
    ]
  };
}

function menuConsultaHogar() {
  return {
    inline_keyboard: [
      [{ text: "💰 ¿Cuánto gasté en mercado?", callback_data: "repq|mercado" }],
      [{ text: "🏠 ¿Cuánto gasté en gastos del hogar?", callback_data: "repq|hogartotal" }],
      [{ text: "↩️ Volver a consultas", callback_data: "rep|consultas" }]
    ]
  };
}

function menuConsultaDiana() {
  return {
    inline_keyboard: [
      [{ text: "💰 ¿Cuánto gasté en cosas para Diana?", callback_data: "repq|dianatotal" }],
      [{ text: "↩️ Volver a consultas", callback_data: "rep|consultas" }]
    ]
  };
}

function menuConsultaTC() {
  return {
    inline_keyboard: [
      [{ text: "💳 ¿Cuánto pagué con TC este mes?", callback_data: "repq|tctotal" }],
      [{ text: "↩️ Volver a consultas", callback_data: "rep|consultas" }]
    ]
  };
}

async function menuInicio(env, chatId) {
  let pendientes = 0;
  try {
    const r = await env.DB.prepare(`SELECT COUNT(*) AS total FROM pendientes WHERE chat_id = ? AND estado IN ('foto_pendiente', 'foto_descripcion')`).bind(String(chatId)).first();
    pendientes = Number(r?.total || 0);
  } catch (error) {
    console.log("NO SE PUDO CONTAR PENDIENTES DE FOTO", error);
  }

  const filas = [];
  if (pendientes > 0) {
    filas.push([{ text: `📥 PENDIENTES POR VALIDAR (${pendientes})`, callback_data: "foto|menu" }]);
  } else {
    filas.push([{ text: "📥 PENDIENTES POR VALIDAR", callback_data: "foto|menu" }]);
  }
  filas.push([{ text: "📊 REPORTES", callback_data: "rep|menu" }]);
  return { inline_keyboard: filas };
}

// ============================================================
// REPORTES V17
// ============================================================

function fechaLocalISO() {
  const ahora = new Date();
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(ahora);
  const get = (t) => partes.find(p => p.type === t)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function nombreMes(numero) {
  return ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"][numero - 1] || "";
}

function formatearPesosReporte(valor) {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(Number(valor || 0)) + " COP";
}

function interpretarComandoReporte(texto) {
  const t = String(texto || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (t === "/hoy" || t === "/dia") return { tipo: "hoy" };

  const partes = t.split(" ");
  if (partes[0] === "/detalle") {
    const argumento = partes.slice(1).join(" ").trim();
    const fechaActual = fechaLocalISO();
    const anioActual = Number(fechaActual.slice(0, 4));
    let numeroMes = Number(fechaActual.slice(5, 7));

    if (argumento) {
      if (/^\d{1,2}$/.test(argumento)) {
        numeroMes = Number(argumento);
      } else {
        const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "setiembre", "octubre", "noviembre", "diciembre"];
        const indice = meses.indexOf(argumento.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
        if (indice === -1) return { tipo: "invalido" };
        numeroMes = indice === 8 ? 9 : indice + 1;
      }
    }

    if (numeroMes < 1 || numeroMes > 12) return { tipo: "invalido" };
    return { tipo: "detalle", periodo: `${anioActual}-${String(numeroMes).padStart(2, "0")}` };
  }

  if (!partes.length || !["/mes", "/resumen"].includes(partes[0])) return null;

  const comando = partes[0];
  let detallado = false;
  let argumento = "";

  if (partes[1] === "detallado") {
    detallado = true;
    argumento = partes.slice(2).join(" ").trim();
  } else if (partes[1] === "mes" && comando === "/resumen") {
    argumento = partes.slice(2).join(" ").trim();
  } else {
    argumento = partes.slice(1).join(" ").trim();
  }

  const fechaActual = fechaLocalISO();
  const anioActual = Number(fechaActual.slice(0, 4));
  let numeroMes = Number(fechaActual.slice(5, 7));

  if (argumento) {
    if (/^\d{1,2}$/.test(argumento)) {
      numeroMes = Number(argumento);
    } else {
      const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
      const indice = meses.indexOf(argumento.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
      if (indice === -1) return { tipo: "invalido" };
      numeroMes = indice + 1;
    }
  }

  if (numeroMes < 1 || numeroMes > 12) return { tipo: "invalido" };

  const periodo = `${anioActual}-${String(numeroMes).padStart(2, "0")}`;
  return { tipo: detallado ? "mes_detallado" : "mes", periodo };
}

async function generarResumenHoy(env, chatId) {
  if (!env.DB) return "⚠️ No está disponible la base de datos.";
  const fecha = fechaLocalISO();
  try {
    const rows = await env.DB.prepare(`
      SELECT g.fecha, g.monto_total, i.concepto, i.monto, i.categoria, i.subcategoria, i.comercio
      FROM gastos g LEFT JOIN gasto_items i ON i.gasto_id = g.id
      WHERE g.chat_id = ? AND g.estado = 'confirmado' AND g.fecha = ?
      ORDER BY g.created_at ASC
    `).bind(String(chatId), fecha).all();
    const items = rows?.results || [];
    if (!items.length) return `📅 HOY — ${formatearFecha(fecha)}\n\nNo tienes gastos registrados hoy.`;
    const total = items.reduce((sum, r) => sum + Number(r.monto || 0), 0);
    let out = `📅 HOY — ${formatearFecha(fecha)}\n\n💰 Total: ${formatearPesosReporte(total)}\n\n🧾 Gastos (${items.length}):`;
    for (const r of items) {
      out += `\n• ${descripcionParaReporte(r)} — ${formatearPesosReporte(r.monto)}`;
    }
    return out;
  } catch (e) {
    console.log("ERROR RESUMEN HOY", e?.stack || e);
    return "⚠️ No pude generar el resumen de hoy.";
  }
}

async function generarResumenMes(env, chatId, periodoMes = null) {
  if (!env.DB) return "⚠️ No está disponible la base de datos.";
  const fecha = fechaLocalISO();
  const mes = periodoMes || fecha.slice(0, 7);
  try {
    const rows = await env.DB.prepare(`
      SELECT g.id AS gasto_id, g.fecha, g.created_at, i.monto, i.categoria
      FROM gastos g LEFT JOIN gasto_items i ON i.gasto_id = g.id
      WHERE g.chat_id = ? AND g.estado = 'confirmado' AND substr(g.fecha,1,7) = ?
      ORDER BY g.fecha ASC, g.created_at ASC
    `).bind(String(chatId), mes).all();
    const items = rows?.results || [];
    const numeroMes = Number(mes.slice(5,7));
    const anio = mes.slice(0,4);
    if (!items.length) return `📊 RESUMEN DE ${nombreMes(numeroMes).toUpperCase()} ${anio}\n\nNo tienes gastos registrados en este mes.`;

    const total = items.reduce((sum, r) => sum + Number(r.monto || 0), 0);
    const porCategoria = agruparPorCategoria(items);

    let out = `📊 RESUMEN DE ${nombreMes(numeroMes).toUpperCase()} ${anio}\n\n💰 Total gastado: ${formatearPesosReporte(total)}\n\n📂 POR CATEGORÍA`;
    for (const grupo of porCategoria) {
      out += `\n• ${grupo.nombre}: ${formatearPesosReporte(grupo.total)}`;
    }

    const movimientos = new Set(items.map(r => r.gasto_id).filter(Boolean)).size;
    out += `\n\n🧾 Movimientos: ${movimientos || items.length}`;
    return out;
  } catch (e) {
    console.log("ERROR RESUMEN MES", e?.stack || e);
    return "⚠️ No pude generar el resumen mensual.";
  }
}

async function generarDetalleMes(env, chatId, periodoMes = null) {
  if (!env.DB) return "⚠️ No está disponible la base de datos.";

  const fecha = fechaLocalISO();
  const mes = periodoMes || fecha.slice(0, 7);
  const numeroMes = Number(mes.slice(5, 7));
  const anio = mes.slice(0, 4);

  try {
    // Un gasto puede tener más de un item. Agrupamos por gasto_id para
    // mostrar una sola línea por movimiento y evitar duplicados.
    const rows = await env.DB.prepare(`
      SELECT
        g.id AS gasto_id,
        g.fecha,
        g.created_at,
        SUM(COALESCE(i.monto, 0)) AS monto,
        GROUP_CONCAT(
          CASE
            WHEN TRIM(COALESCE(i.concepto, '')) <> ''
              AND lower(TRIM(i.concepto)) NOT LIKE 'compra en %'
              THEN TRIM(i.concepto)
            WHEN TRIM(COALESCE(i.detalle, '')) <> '' THEN TRIM(i.detalle)
            WHEN TRIM(COALESCE(i.concepto, '')) <> '' THEN TRIM(i.concepto)
            ELSE 'Gasto'
          END,
          ' + '
        ) AS descripcion
      FROM gastos g
      LEFT JOIN gasto_items i ON i.gasto_id = g.id
      WHERE g.chat_id = ?
        AND g.estado = 'confirmado'
        AND substr(g.fecha, 1, 7) = ?
      GROUP BY g.id, g.fecha, g.created_at
      ORDER BY g.fecha ASC, g.created_at ASC
    `).bind(String(chatId), mes).all();

    const items = rows?.results || [];

    if (!items.length) {
      return `📋 DETALLE ${nombreMes(numeroMes).toUpperCase()} ${anio}\n\nNo tienes gastos registrados en este mes.`;
    }

    let out = `📋 DETALLE ${nombreMes(numeroMes).toUpperCase()} ${anio}`;
    let fechaAnterior = null;

    for (const r of items) {
      if (r.fecha !== fechaAnterior) {
        const dia = String(r.fecha || '').slice(8, 10);
        out += `\n\n📅 ${dia} ${nombreMes(numeroMes).toUpperCase()}`;
        fechaAnterior = r.fecha;
      }

      const descripcion = capitalizar(String(r.descripcion || 'Gasto').trim());
      out += `\n• ${descripcion} — ${formatearPesosSimpleReporte(r.monto)}`;
    }

    return out;
  } catch (e) {
    console.log("ERROR DETALLE MES", e?.stack || e);
    return "⚠️ No pude generar el detalle mensual.";
  }
}

function formatearPesosSimpleReporte(valor) {
  return "$" + new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(Number(valor || 0));
}

function normalizarNombreReporte(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ");
}

function obtenerCategoriaCatalogoPorNombre(nombre) {
  const clave = normalizarNombreReporte(nombre);
  return CATALOGO_FALLBACK.categorias.find(c => normalizarNombreReporte(c.nombre) === clave) || null;
}

function obtenerSubcategoriaCatalogoPorNombre(nombre, categoriaId) {
  const clave = normalizarNombreReporte(nombre);
  return CATALOGO_FALLBACK.subcategorias.find(s =>
    s.categoria_id === categoriaId && normalizarNombreReporte(s.nombre) === clave
  ) || null;
}

function agruparPorCategoria(items) {
  const grupos = new Map();

  for (const r of items) {
    const categoriaCatalogo = obtenerCategoriaCatalogoPorNombre(r.categoria);
    const clave = categoriaCatalogo?.id || `sin:${normalizarNombreReporte(r.categoria) || "categoria"}`;
    const nombre = categoriaCatalogo?.nombre || r.categoria?.trim() || "Sin categoría";

    if (!grupos.has(clave)) {
      grupos.set(clave, {
        id: categoriaCatalogo?.id || null,
        nombre,
        orden: categoriaCatalogo?.orden || 999,
        total: 0,
        items: []
      });
    }

    const grupo = grupos.get(clave);
    grupo.total += Number(r.monto || 0);
    grupo.items.push(r);
  }

  return [...grupos.values()].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es"));
}

async function generarResumenMesDetallado(env, chatId, periodoMes = null) {
  if (!env.DB) return { texto: "⚠️ No está disponible la base de datos." };
  const fecha = fechaLocalISO();
  const mes = periodoMes || fecha.slice(0, 7);

  try {
    const rows = await env.DB.prepare(`
      SELECT g.id AS gasto_id, g.fecha, g.created_at, i.monto, i.categoria, i.subcategoria
      FROM gastos g LEFT JOIN gasto_items i ON i.gasto_id = g.id
      WHERE g.chat_id = ? AND g.estado = 'confirmado' AND substr(g.fecha,1,7) = ?
      ORDER BY g.fecha ASC, g.created_at ASC
    `).bind(String(chatId), mes).all();

    const items = rows?.results || [];
    const numeroMes = Number(mes.slice(5,7));
    const anio = mes.slice(0,4);

    if (!items.length) {
      return { texto: `📊 RESUMEN DETALLADO DE ${nombreMes(numeroMes).toUpperCase()} ${anio}\n\nNo tienes gastos registrados en este mes.` };
    }

    const total = items.reduce((sum, r) => sum + Number(r.monto || 0), 0);
    const categorias = agruparPorCategoria(items);
    let out = `📊 RESUMEN DETALLADO DE ${nombreMes(numeroMes).toUpperCase()} ${anio}\n\n💰 TOTAL GASTADO: ${formatearPesosReporte(total)}`;

    for (const categoria of categorias) {
      out += `\n\n📂 ${categoria.nombre.toUpperCase()} — SUBTOTAL: ${formatearPesosReporte(categoria.total)}`;

      const subgrupos = new Map();
      for (const r of categoria.items) {
        const subCatalogo = categoria.id
          ? obtenerSubcategoriaCatalogoPorNombre(r.subcategoria, categoria.id)
          : null;
        const clave = subCatalogo?.id || `sin:${normalizarNombreReporte(r.subcategoria) || "subcategoria"}`;
        const nombre = subCatalogo?.nombre || r.subcategoria?.trim() || "Sin subcategoría";
        const orden = subCatalogo?.orden || 999;

        if (!subgrupos.has(clave)) {
          subgrupos.set(clave, { nombre, orden, total: 0 });
        }
        subgrupos.get(clave).total += Number(r.monto || 0);
      }

      const subordenadas = [...subgrupos.values()].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es"));
      for (const sub of subordenadas) {
        out += `\n  • ${sub.nombre}: ${formatearPesosReporte(sub.total)}`;
      }
    }

    const movimientos = new Set(items.map(r => r.gasto_id).filter(Boolean)).size;
    out += `\n\n🧾 Movimientos: ${movimientos || items.length}`;

    // Botones directos: cada botón lleva el ID real de la categoría y el período.
    // No pasa por IA ni por una búsqueda textual, evitando diferencias como
    // "Pagos varios/Oscio" vs. "Pagos varios/ Oscio".
    const categoriasConGastos = categorias.filter(c => c.id);
    const botones = categoriasConGastos.map(c => ({
      text: `${emojiCategoria(c.nombre)} ${c.nombre}`,
      callback_data: `repcat|${c.id}|${mes}`
    }));
    const filas = agruparEnDosColumnas(botones);

    if (filas.length) {
      filas.push([{ text: "↩️ VOLVER / REPORTES", callback_data: "rep|menu" }]);
    }

    return {
      texto: out,
      replyMarkup: filas.length ? { inline_keyboard: filas } : null
    };
  } catch (e) {
    console.log("ERROR RESUMEN MES DETALLADO", e?.stack || e);
    return { texto: "⚠️ No pude generar el resumen mensual detallado." };
  }
}

async function detalleCategoriaReporte(env, chatId, categoriaId, periodoMes, pagina = 0) {
  if (!env.DB) return { texto: "⚠️ No está disponible la base de datos." };

  const categoria = CATALOGO_FALLBACK.categorias.find(c => c.id === categoriaId);
  if (!categoria) return { texto: "⚠️ Categoría de reporte no válida." };

  // MUY IMPORTANTE: el período viene del botón. Nunca usamos el mes actual
  // cuando estamos navegando dentro de un /mes detallado histórico.
  const mes = /^\d{4}-\d{2}$/.test(String(periodoMes || ""))
    ? String(periodoMes)
    : null;
  if (!mes) {
    return { texto: "⚠️ No pude conservar el mes de este reporte. Vuelve a ejecutar /mes detallado con el mes que quieres revisar." };
  }
  const numeroMes = Number(mes.slice(5, 7));
  const anio = mes.slice(0, 4);
  const paginaActual = Math.max(0, Number(pagina) || 0);

  try {
    const sql = `SELECT g.id AS gasto_id, g.fecha, g.created_at,
        i.concepto, i.detalle, i.monto, i.comercio, i.canal, i.persona,
        i.categoria, i.subcategoria, i.forma_pago
      FROM gastos g
      JOIN gasto_items i ON i.gasto_id=g.id
      WHERE g.chat_id=? AND g.estado='confirmado' AND substr(g.fecha,1,7)=?
      ORDER BY g.fecha ASC, g.created_at ASC`;

    const rows = (await env.DB.prepare(sql).bind(String(chatId), mes).all()).results || [];

    // La categoría se compara por su nombre normalizado para aceptar datos
    // históricos como "Pagos varios/Oscio" y "Pagos varios/ Oscio".
    const encontrados = rows.filter(r =>
      normalizarNombreReporte(r.categoria) === normalizarNombreReporte(categoria.nombre)
    );

    const total = encontrados.reduce((s, r) => s + Number(r.monto || 0), 0);

    if (!encontrados.length) {
      return {
        texto: `🔎 ${categoria.nombre.toUpperCase()} — ${nombreMes(numeroMes).toUpperCase()} ${anio}\n\n💰 SUBTOTAL: ${formatearPesosReporte(0)}\n🧾 Movimientos: 0\n\nNo encontré movimientos en esta categoría.`,
        replyMarkup: { inline_keyboard: [[{ text: "⬅️ VOLVER AL RESUMEN", callback_data: `repcatback|${mes}` }]] }
      };
    }

    // ============================================================
    // DETALLE AGRUPADO POR SUBCATEGORÍA
    // ============================================================
    // Antes se mostraban todos los movimientos juntos y las subcategorías
    // solamente aparecían como un resumen arriba. Ahora cada subcategoría
    // contiene inmediatamente sus propios movimientos, que es mucho más
    // fácil de auditar.
    const subgrupos = new Map();
    for (const r of encontrados) {
      const subCatalogo = obtenerSubcategoriaCatalogoPorNombre(r.subcategoria, categoria.id);
      const clave = subCatalogo?.id || `sin:${normalizarNombreReporte(r.subcategoria) || "subcategoria"}`;
      const nombre = subCatalogo?.nombre || r.subcategoria?.trim() || "Sin subcategoría";
      const orden = subCatalogo?.orden || 999;

      if (!subgrupos.has(clave)) {
        subgrupos.set(clave, { nombre, orden, items: [], total: 0 });
      }
      const grupo = subgrupos.get(clave);
      grupo.items.push(r);
      grupo.total += Number(r.monto || 0);
    }

    const subordenadas = [...subgrupos.values()]
      .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es"));

    // Construimos bloques completos por subcategoría. Así, cuando caben en
    // un mensaje, queda exactamente: SUBCATEGORÍA -> todos sus gastos ->
    // siguiente SUBCATEGORÍA -> todos sus gastos.
    const bloques = [];
    for (const sub of subordenadas) {
      let bloque = `📂 ${sub.nombre.toUpperCase()} — SUBTOTAL: ${formatearPesosReporte(sub.total)}\n`;
      for (const r of sub.items) {
        const descripcion = descripcionParaReporte(r);
        // Sangría visible en Telegram: NBSP evita que el espacio inicial se pierda.
        // La subcategoría queda alineada a la izquierda y sus movimientos un nivel a la derecha.
        bloque += `\n\u00a0📅 ${formatearFecha(r.fecha)}\n\u00a0• ${descripcion} — ${formatearPesosSimpleReporte(r.monto)}\n`;
      }
      bloques.push({ texto: bloque.trim(), cantidad: sub.items.length });
    }

    // Telegram limita los mensajes a 4096 caracteres. Dejamos margen para
    // encabezado, pie y botones. Preferimos no cortar una subcategoría entre
    // páginas si todas sus líneas caben juntas.
    const LIMITE_TEXTO = 3400;
    const paginas = [];
    let paginaTexto = "";
    let paginaMovimientos = 0;

    for (const bloque of bloques) {
      const separador = paginaTexto ? "\n\n" : "";
      if (paginaTexto && (paginaTexto.length + separador.length + bloque.texto.length) > LIMITE_TEXTO) {
        paginas.push({ texto: paginaTexto, movimientos: paginaMovimientos });
        paginaTexto = bloque.texto;
        paginaMovimientos = bloque.cantidad;
      } else {
        paginaTexto += separador + bloque.texto;
        paginaMovimientos += bloque.cantidad;
      }
    }
    if (paginaTexto) paginas.push({ texto: paginaTexto, movimientos: paginaMovimientos });

    // Protección adicional: si una sola subcategoría supera el límite, se
    // divide por movimientos sin mezclarla con otra subcategoría.
    if (bloques.some(b => b.texto.length > LIMITE_TEXTO)) {
      const paginasLargas = [];
      for (const sub of subordenadas) {
        let bloqueActual = `📂 ${sub.nombre.toUpperCase()} — SUBTOTAL: ${formatearPesosReporte(sub.total)}\n`;
        let movActual = 0;
        for (const r of sub.items) {
          const linea = `\n 📅 ${formatearFecha(r.fecha)}\n • ${descripcionParaReporte(r)} — ${formatearPesosSimpleReporte(r.monto)}\n`;
          if (movActual > 0 && bloqueActual.length + linea.length > LIMITE_TEXTO) {
            paginasLargas.push({ texto: bloqueActual.trim(), movimientos: movActual });
            bloqueActual = `📂 ${sub.nombre.toUpperCase()} — CONTINUACIÓN\n`;
            movActual = 0;
          }
          bloqueActual += linea;
          movActual++;
        }
        if (movActual) paginasLargas.push({ texto: bloqueActual.trim(), movimientos: movActual });
      }
      paginas.length = 0;
      paginas.push(...paginasLargas);
    }

    const pagina = Math.min(paginaActual, Math.max(0, paginas.length - 1));
    const contenido = paginas[pagina];
    const desdeMov = paginas.slice(0, pagina).reduce((s, x) => s + x.movimientos, 0) + 1;
    const hastaMov = desdeMov + contenido.movimientos - 1;

    let out = `🔎 ${categoria.nombre.toUpperCase()} — ${nombreMes(numeroMes).toUpperCase()} ${anio}\n\n`;
    out += `💰 SUBTOTAL CATEGORÍA: ${formatearPesosReporte(total)}\n`;
    out += `🧾 MOVIMIENTOS: ${encontrados.length}\n\n`;
    out += `📋 DETALLE ${desdeMov}-${hastaMov} DE ${encontrados.length}\n\n`;
    out += contenido.texto;
    out += `\n\n━━━━━━━━━━━━━━━━━━\n💰 TOTAL ${categoria.nombre.toUpperCase()}: ${formatearPesosReporte(total)}`;

    const filas = [];
    if (pagina + 1 < paginas.length) {
      filas.push([{
        text: `🧾 VER SIGUIENTE (${paginas.length - pagina - 1})`,
        callback_data: `repcatpg|${categoria.id}|${mes}|${pagina + 1}`
      }]);
    }
    if (pagina > 0) {
      filas.push([{
        text: "↩️ VER ANTERIOR",
        callback_data: `repcatpg|${categoria.id}|${mes}|${pagina - 1}`
      }]);
    }

    // El mes siempre viaja en el callback. Al volver, se reconstruye el mismo
    // resumen histórico, no el resumen del mes actual.
    // El período se incrusta explícitamente en el callback y se valida al volver.
    // Nunca debe depender de la fecha actual del servidor.
    filas.push([{ text: "⬅️ VOLVER AL RESUMEN", callback_data: `repcatback|${mes}` }]);

    return { texto: out, replyMarkup: { inline_keyboard: filas } };
  } catch (e) {
    console.log("ERROR DETALLE CATEGORIA REPORTE", e?.stack || e);
    return { texto: "⚠️ No pude mostrar el detalle de esta categoría." };
  }
}

// ============================================================
// TELEGRAM - BOTONES DE CORRECCIÓN
// ============================================================

async function procesarTelegramCallback(request, env, body) {
  const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (!env.TELEGRAM_WEBHOOK_SECRET || secret !== env.TELEGRAM_WEBHOOK_SECRET) {
    console.log("CALLBACK RECHAZADO: secret incorrecto");
    return new Response("Unauthorized", { status: 401 });
  }

  const query = body?.callback_query;
  const data = query?.data || "";
  const chatId = query?.message?.chat?.id;

  console.log("TELEGRAM CALLBACK RECIBIDO", JSON.stringify({
    callbackId: query?.id,
    data,
    chatId
  }));

  // Telegram necesita una respuesta rápida al clic para quitar el spinner.
  await responderCallbackTelegram(env, query?.id);

  if (!chatId) return new Response("OK", { status: 200 });

  const [accion, pendingId, extra] = data.split("|");

  // ----------------------------------------------------------
  // BORRADO DE GASTOS POR DÍA
  // Estos callbacks no dependen de un gasto pendiente.
  // ----------------------------------------------------------
  if (accion === "del") {
    const fechaBorrar = extra || pendingId;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaBorrar || "")) {
      await enviarTelegram(env, chatId, "⚠️ Fecha de borrado no válida.");
      return new Response("OK", { status: 200 });
    }

    if (pendingId === "cancel") {
      await enviarTelegram(env, chatId, `↩️ No se borró nada del ${formatearFecha(fechaBorrar)}.`);
      return new Response("OK", { status: 200 });
    }

    if (pendingId === "confirm") {
      try {
        const resultadoBorrado = await borrarGastosDia(env, chatId, fechaBorrar);

        if (!resultadoBorrado.cantidad) {
          await enviarTelegram(env, chatId, `ℹ️ No había compras confirmadas para borrar el ${formatearFecha(fechaBorrar)}.`);
          return new Response("OK", { status: 200 });
        }

        await enviarTelegram(
          env,
          chatId,
          `✅ Borrado completado.\n\n` +
          `📅 ${formatearFecha(fechaBorrar)}\n` +
          `🧾 Compras borradas: ${resultadoBorrado.cantidad}\n` +
          `💰 Total eliminado: ${formatearPesosReporte(resultadoBorrado.total)}`
        );
      } catch (error) {
        console.log("ERROR BORRANDO GASTOS DEL DÍA", error?.stack || error);
        await enviarTelegram(env, chatId, "⚠️ No pude borrar los gastos. No hice el borrado parcial; revisa el log del Worker.");
      }
      return new Response("OK", { status: 200 });
    }

    await enviarTelegram(env, chatId, "⚠️ Acción de borrado no válida.");
    return new Response("OK", { status: 200 });
  }

  // ----------------------------------------------------------
  // PENDIENTES DETECTADOS DESDE FOTOS BANCARIAS
  // ----------------------------------------------------------
  if (accion === "foto") {
    if (pendingId === "menu") {
      const siguiente = await obtenerSiguientePendienteFoto(env, chatId);
      if (!siguiente) {
        await enviarTelegram(env, chatId, "📥 No tienes compras pendientes por validar.", await menuInicio(env, chatId));
      } else {
        await mostrarPendienteFoto(env, chatId, siguiente.id);
      }
      return new Response("OK", { status: 200 });
    }

    if (pendingId) {
      const pendienteFoto = await obtenerPendienteFotoPorId(env, pendingId, chatId);
      if (!pendienteFoto) {
        await enviarTelegram(env, chatId, "ℹ️ Esta compra ya no está pendiente.");
        return new Response("OK", { status: 200 });
      }
      await mostrarPendienteFoto(env, chatId, pendingId);
      return new Response("OK", { status: 200 });
    }
  }

  // Acciones específicas de una compra detectada desde foto.
  if (accion === "photo_desc" || accion === "photo_save" || accion === "photo_deny") {
    if (!pendingId) {
      await enviarTelegram(env, chatId, "⚠️ Pendiente no válido.");
      return new Response("OK", { status: 200 });
    }

    const pendienteFoto = await obtenerPendienteFotoPorId(env, pendingId, chatId);
    if (!pendienteFoto) {
      await enviarTelegram(env, chatId, "ℹ️ Esta compra ya no está pendiente.");
      return new Response("OK", { status: 200 });
    }

    if (accion === "photo_desc") {
      await actualizarEstadoPendiente(env, pendingId, "foto_descripcion");
      await enviarTelegram(
        env,
        chatId,
        "📝 Escribe una descripción breve de lo que compraste.\n\nEjemplos: \"mercado\", \"televisor\", \"comida con Diana\".",
        { inline_keyboard: [[{ text: "↩️ Volver", callback_data: `foto|${pendingId}` }]] }
      );
      return new Response("OK", { status: 200 });
    }

    if (accion === "photo_deny") {
      await actualizarEstadoPendiente(env, pendingId, "denegado");
      await enviarTelegram(env, chatId, "❌ Compra denegada. No se guardó como gasto.");
      await mostrarSiguientePendienteFotoOFin(env, chatId);
      return new Response("OK", { status: 200 });
    }

    if (accion === "photo_save") {
      await confirmarPendienteTelegram(env, chatId, pendingId);
      await mostrarSiguientePendienteFotoOFin(env, chatId);
      return new Response("OK", { status: 200 });
    }
  }

  // Botones del menú de reportes: no dependen de un gasto pendiente.
  if (accion === "rep") {
    if (pendingId === "menu") {
      await enviarTelegram(env, chatId, "📊 REPORTES\n\nElige lo que quieres consultar:", menuReportes());
    } else if (pendingId === "consultas") {
      await enviarTelegram(env, chatId, "🔎 CONSULTAS\n\nElige el tipo de consulta:", menuConsultas());
    } else if (pendingId === "dia") {
      await enviarTelegram(env, chatId, await generarResumenHoy(env, chatId));
    } else if (pendingId === "mes") {
      await enviarTelegram(env, chatId, await generarResumenMes(env, chatId));
    } else if (pendingId === "mesdet") {
      const resultadoMesDetallado = await generarResumenMesDetallado(env, chatId);
      if (resultadoMesDetallado && resultadoMesDetallado.texto) {
        await enviarTelegram(env, chatId, resultadoMesDetallado.texto, resultadoMesDetallado.replyMarkup || null);
      } else {
        await enviarTelegram(env, chatId, resultadoMesDetallado);
      }
    } else if (pendingId === "detalle") {
      await enviarTelegram(env, chatId, await generarDetalleMes(env, chatId));
    } else {
      await enviarTelegram(env, chatId, "⚠️ Opción de reporte no válida.");
    }
    return new Response("OK", { status: 200 });
  }

  // ----------------------------------------------------------
  // AUDITORÍA DEL /MES DETALLADO POR CATEGORÍA
  // Los botones llevan directamente categoría + mes; no pasan por IA.
  // ----------------------------------------------------------
  if (accion === "repcat") {
    const categoriaId = pendingId || "";
    const periodoMes = extra || "";
    const resultadoCategoria = await detalleCategoriaReporte(env, chatId, categoriaId, periodoMes, 0);
    await enviarTelegram(env, chatId, resultadoCategoria.texto, resultadoCategoria.replyMarkup || null);
    return new Response("OK", { status: 200 });
  }

  if (accion === "repcatpg") {
    const partes = data.split("|");
    const categoriaId = partes[1] || "";
    const periodoMes = partes[2] || "";
    const offset = Number(partes[3] || 0);
    const resultadoCategoria = await detalleCategoriaReporte(env, chatId, categoriaId, periodoMes, offset);
    await enviarTelegram(env, chatId, resultadoCategoria.texto, resultadoCategoria.replyMarkup || null);
    return new Response("OK", { status: 200 });
  }

  if (accion === "repcatback") {
    // IMPORTANTE: el segundo campo del callback ES el mes que se estaba auditando.
    // No usamos fechaLocalISO() salvo que el callback sea inválido, para evitar
    // que volver desde agosto termine mostrando septiembre.
    const periodoMes = /^\d{4}-\d{2}$/.test(String(pendingId || "")) ? String(pendingId) : null;
    console.log("REPCATBACK - VOLVER AL MES", JSON.stringify({ periodoMes, data }));
    const resultadoMesDetallado = await generarResumenMesDetallado(env, chatId, periodoMes);
    if (resultadoMesDetallado && resultadoMesDetallado.texto) {
      await enviarTelegram(env, chatId, resultadoMesDetallado.texto, resultadoMesDetallado.replyMarkup || null);
    } else {
      await enviarTelegram(env, chatId, resultadoMesDetallado);
    }
    return new Response("OK", { status: 200 });
  }

  if (accion === "repnext") {
    const desde = pendingId || "";
    const hasta = extra || "";
    const partes = data.split("|");
    const offset = Number(partes[3] || 0);
    const resultadoPagina = await generarPaginaMovimientosPeriodo(env, chatId, desde, hasta, offset);
    await enviarTelegram(env, chatId, resultadoPagina.texto, resultadoPagina.replyMarkup || null);
    return new Response("OK", { status: 200 });
  }

  if (accion === "repdetq") {
    await enviarTelegram(env, chatId, await detalleConsultaPredefinida(env, chatId, pendingId));
    return new Response("OK", { status: 200 });
  }

  if (accion === "repdet") {
    const partes = data.split("|");
    const sujeto = decodeURIComponent(partes[1] || pendingId || "");
    const periodoMes = /^\d{4}-\d{2}$/.test(partes[2] || "") ? partes[2] : null;
    await enviarTelegram(env, chatId, await detalleConsultaGenerica(env, chatId, sujeto, periodoMes));
    return new Response("OK", { status: 200 });
  }

  if (accion === "repq") {
    const menus = {
      rest: ["🍽️ RESTAURANTES", menuConsultaRestaurantes()],
      hogar: ["🛒 MERCADO / HOGAR", menuConsultaHogar()],
      diana: ["👤 GASTOS DE DIANA", menuConsultaDiana()],
      tc: ["💳 PAGOS CON TARJETA", menuConsultaTC()]
    };

    if (menus[pendingId]) {
      await enviarTelegram(env, chatId, menus[pendingId][0] + "\n\nElige una consulta:", menus[pendingId][1]);
    } else {
      const resultadoConsulta = await ejecutarConsultaReporte(env, chatId, pendingId);
      if (resultadoConsulta && resultadoConsulta.texto) {
        await enviarTelegram(env, chatId, resultadoConsulta.texto, resultadoConsulta.replyMarkup || null);
      } else {
        await enviarTelegram(env, chatId, resultadoConsulta);
      }
    }
    return new Response("OK", { status: 200 });
  }

  if (!accion || !pendingId) {
    await enviarTelegram(env, chatId, "⚠️ Botón inválido. Envía nuevamente el gasto.");
    return new Response("OK", { status: 200 });
  }

  try {
    const pendiente = await obtenerPendientePorId(env, pendingId, chatId);
    if (!pendiente) {
      await enviarTelegram(env, chatId, "ℹ️ Este gasto ya no está pendiente. Envía nuevamente el gasto si quieres registrarlo.");
      return new Response("OK", { status: 200 });
    }

    if (accion === "dup_save") {
      await confirmarPendienteTelegram(env, chatId, pendingId);
      return new Response("OK", { status: 200 });
    }

    if (accion === "dup_cancel") {
      await actualizarEstadoPendiente(env, pendingId, "reemplazado");
      await enviarTelegram(env, chatId, "↩️ No se guardó el gasto. No se modificó el gasto anterior.");
      return new Response("OK", { status: 200 });
    }

    if (accion === "confirm") {
      await confirmarPendienteTelegram(env, chatId, pendingId);
      return new Response("OK", { status: 200 });
    }

    if (accion === "corr_back") {
      await actualizarEstadoPendiente(env, pendingId, "pendiente");
      await enviarTelegram(
        env,
        chatId,
        "✏️ ¿Qué quieres corregir?",
        crearTecladoTipoCorreccion(pendingId)
      );
      return new Response("OK", { status: 200 });
    }

    if (accion === "corr_cancel") {
      await actualizarEstadoPendiente(env, pendingId, "pendiente");
      await enviarTelegram(env, chatId, "↩️ Corrección cancelada. El gasto sigue pendiente.", botonesPendiente(pendingId));
      return new Response("OK", { status: 200 });
    }

    const interpretacion = JSON.parse(pendiente.interpretacion_json || "{}");

    if (accion === "correct") {
      const movimientos = interpretacion.movimientos || [];
      await marcarPendienteCorrigiendo(env, pendingId);
      await enviarTelegram(
        env,
        chatId,
        "✏️ ¿Qué quieres corregir?",
        crearTecladoTipoCorreccion(pendingId)
      );
      return new Response("OK", { status: 200 });
    }

    if (accion === "corr_cat_menu") {
      const movimientos = interpretacion.movimientos || [];
      if (movimientos.length > 1) {
        await enviarTelegram(env, chatId, "✏️ ¿Qué movimiento quieres corregir?", crearTecladoMovimientos(movimientos, pendingId));
      } else {
        await enviarTelegram(env, chatId, "✏️ Selecciona la categoría:", await crearTecladoCategorias(env, pendingId));
      }
      return new Response("OK", { status: 200 });
    }

    if (accion === "corr_data") {
      await actualizarEstadoPendiente(env, pendingId, "corrigiendo_datos");
      await enviarTelegram(
        env,
        chatId,
        "📝 Escribe nuevamente el gasto con el dato corregido.",
        { inline_keyboard: [[{ text: "↩️ Volver", callback_data: `corr_back|${pendingId}` }]] }
      );
      return new Response("OK", { status: 200 });
    }

    if (accion === "corr_move") {
      const indice = Number(extra);
      if (!Number.isInteger(indice) || !interpretacion.movimientos?.[indice]) {
        await enviarTelegram(env, chatId, "⚠️ Ese movimiento ya no está disponible.");
        return new Response("OK", { status: 200 });
      }
      interpretacion._correccion_contexto = { movimiento_index: indice };
      await marcarPendienteCorrigiendoConInterpretacion(env, pendingId, interpretacion);
      await enviarTelegram(env, chatId, "✏️ Ahora selecciona la categoría:", await crearTecladoCategorias(env, pendingId));
      return new Response("OK", { status: 200 });
    }

    if (accion === "corr_cat") {
      // El callback usa el índice corto de la categoría para no superar
      // el límite de 64 bytes de Telegram.
      const categoriaIndex = Number(extra);
      const categoria = Number.isInteger(categoriaIndex)
        ? CATALOGO_FALLBACK.categorias[categoriaIndex]
        : null;
      if (!categoria) {
        await enviarTelegram(env, chatId, "⚠️ No encontré esa categoría.");
        return new Response("OK", { status: 200 });
      }
      const contexto = interpretacion._correccion_contexto || { movimiento_index: 0 };
      interpretacion._correccion_contexto = {
        ...contexto,
        categoria_id: categoria.id,
        categoria_nombre: categoria.nombre
      };
      await marcarPendienteCorrigiendoConInterpretacion(env, pendingId, interpretacion);
      await enviarTelegram(env, chatId, `📂 ${categoria.nombre}\n\nSelecciona la subcategoría:`, await crearTecladoSubcategorias(env, pendingId, categoria.id));
      return new Response("OK", { status: 200 });
    }

    if (accion === "corr_sub") {
      // La subcategoría también viaja como índice corto, esta vez dentro
      // de la categoría seleccionada.
      const categoriaId = interpretacion._correccion_contexto?.categoria_id;
      const subcategorias = categoriaId
        ? CATALOGO_FALLBACK.subcategorias.filter(s => s.categoria_id === categoriaId)
        : [];
      const subcategoriaIndex = Number(extra);
      const subcategoria = Number.isInteger(subcategoriaIndex)
        ? subcategorias[subcategoriaIndex]
        : null;
      const categoria = subcategoria
        ? CATALOGO_FALLBACK.categorias.find(c => c.id === subcategoria.categoria_id)
        : null;
      const indice = Number.isInteger(interpretacion._correccion_contexto?.movimiento_index)
        ? interpretacion._correccion_contexto.movimiento_index : 0;
      const movimiento = interpretacion.movimientos?.[indice];
      if (!subcategoria || !categoria || !movimiento) {
        await enviarTelegram(env, chatId, "⚠️ No encontré el movimiento o la subcategoría.");
        return new Response("OK", { status: 200 });
      }

      const anterior = { categoria: movimiento.categoria, subcategoria: movimiento.subcategoria };
      movimiento.categoria = categoria.nombre;
      movimiento.subcategoria = subcategoria.nombre;
      movimiento.confianza = "alta";
      if ((interpretacion.movimientos || []).length === 1) {
        interpretacion.categoria = categoria.nombre;
        interpretacion.subcategoria = subcategoria.nombre;
        interpretacion.confianza_categoria = "alta";
      }
      interpretacion.estado = "pendiente";
      interpretacion._correccion = {
        categoria_anterior: anterior,
        categoria_corregida: {
          categoria: categoria.nombre,
          subcategoria: subcategoria.nombre,
          categoria_id: categoria.id,
          subcategoria_id: subcategoria.id
        },
        tipo: "correccion_categoria",
        movimiento_index: indice
      };
      delete interpretacion._correccion_contexto;

      await actualizarPendienteInterpretacion(env, pendingId, interpretacion);
      await enviarTelegram(env, chatId,
        crearRespuestaGasto(interpretacion) + `\n\n✏️ Clasificación corregida:\n📂 ${categoria.nombre} → ${subcategoria.nombre}`,
        botonesPendiente(pendingId, true)
      );
      return new Response("OK", { status: 200 });
    }

    await enviarTelegram(env, chatId, "⚠️ Acción no reconocida. Envía nuevamente el gasto.");
  } catch (error) {
    console.log("ERROR PROCESANDO CALLBACK", error?.stack || error);
    await enviarTelegram(env, chatId, "⚠️ El botón fue recibido, pero ocurrió un error al procesarlo. Revisa /health y /telegram/webhook-info.");
  }

  return new Response("OK", { status: 200 });
}

function crearTecladoTipoCorreccion(pendingId) {
  return {
    inline_keyboard: [
      [
        { text: "📂 CORREGIR CATEGORÍA", callback_data: `corr_cat_menu|${pendingId}` },
        { text: "📝 CORREGIR DATOS", callback_data: `corr_data|${pendingId}` }
      ],
      [
        { text: "↩️ Volver", callback_data: `corr_back|${pendingId}` }
      ]
    ]
  };
}

function botonesPendiente(pendingId, incluirCancelar = false) {
  const filas = [[
    { text: "✅ SI, guardar", callback_data: `confirm|${pendingId}` },
    { text: "✏️ CORREGIR", callback_data: `correct|${pendingId}` }
  ]];
  if (incluirCancelar) filas.push([{ text: "↩️ Volver", callback_data: `corr_back|${pendingId}` }]);
  return { inline_keyboard: filas };
}

async function confirmarPendienteTelegram(env, chatId, pendingId) {
  const pendiente = await obtenerPendientePorId(env, pendingId, chatId);
  if (!pendiente) {
    await enviarTelegram(env, chatId, "ℹ️ Este gasto ya no está pendiente.");
    return;
  }

  let resultado;
  try {
    resultado = JSON.parse(pendiente.interpretacion_json || "{}");
  } catch {
    await enviarTelegram(env, chatId, "⚠️ El gasto pendiente está dañado. No lo voy a guardar para evitar errores.");
    return;
  }

  if (resultado.monto === null || resultado.estado === "requiere_revision") {
    await enviarTelegram(env, chatId, "⚠️ Este gasto todavía tiene información pendiente.");
    return;
  }

  try {
    // Bloqueo antes de guardar: un doble clic no puede crear dos gastos.
    await actualizarEstadoPendiente(env, pendingId, "procesando");
    const gastoId = await guardarGastoConfirmado(env, chatId, resultado, pendingId);

    // El aprendizaje es secundario: jamás debe convertir un gasto guardado en un falso error.
    try {
      await guardarAprendizajeSiExiste(env, chatId, pendiente, resultado);
    } catch (learningError) {
      console.log("APRENDIZAJE NO GUARDADO; GASTO SI FUE GUARDADO", learningError?.stack || learningError);
    }

    await enviarTelegram(env, chatId,
      `✅ Listo. Gasto guardado.\n\n💰 ${formatearPesos(resultado.monto)}\n📅 ${formatearFecha(resultado.fecha)}`
    );
  } catch (error) {
    console.log("ERROR CONFIRMANDO GASTO", error?.stack || error);
    try { await actualizarEstadoPendiente(env, pendingId, "pendiente"); } catch {}
    await enviarTelegram(env, chatId, "⚠️ No pude guardar el gasto. No quedó confirmado ni lo voy a duplicar. Revisa el log del Worker.");
  }
}

async function responderCallbackTelegram(env, callbackId) {
  if (!callbackId || !env.TELEGRAM_BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackId })
    });
  } catch (error) {
    console.log("ERROR CALLBACK TELEGRAM", error);
  }
}

function crearTecladoMovimientos(movimientos, pendingId) {
  const botones = movimientos.map((m, i) => ({
    text: `${i + 1}. ${capitalizar(m.concepto || "Movimiento")}${m.monto != null ? " · " + formatearPesos(m.monto).replace(" COP", "") : ""}`,
    callback_data: `corr_move|${pendingId}|${i}`
  }));
  return { inline_keyboard: agruparEnDosColumnas(botones) };
}

const CATALOGO_FALLBACK = {
  categorias: [
    { id: "cat_hogar", nombre: "Hogar", orden: 1 },
    { id: "cat_restaurantes_rappi", nombre: "Restaurantes y Rappi", orden: 2 },
    { id: "cat_cuotas_suscripciones", nombre: "Cuotas/suscripciones", orden: 3 },
    { id: "cat_personal", nombre: "Personal", orden: 4 },
    { id: "cat_gastos_perla", nombre: "Gastos perla", orden: 5 },
    { id: "cat_pagos_varios_ocio", nombre: "Pagos varios/Oscio", orden: 6 }
  ],
  subcategorias: [
    { id: "sub_hogar_mercado", categoria_id: "cat_hogar", nombre: "Mercado jumbo o mercaz", orden: 1 },
    { id: "sub_hogar_remesas", categoria_id: "cat_hogar", nombre: "Remesas Rapitienda la roca", orden: 2 },
    { id: "sub_hogar_admin", categoria_id: "cat_hogar", nombre: "Administración Bosques de Chipichape", orden: 3 },
    { id: "sub_hogar_servicios", categoria_id: "cat_hogar", nombre: "Servicios públicos (Emcali, gas)", orden: 4 },
    { id: "sub_hogar_claro", categoria_id: "cat_hogar", nombre: "Claro/ telmex", orden: 5 },
    { id: "sub_hogar_ana", categoria_id: "cat_hogar", nombre: "Ana aseo 2 veces al mes", orden: 6 },
    { id: "sub_hogar_otros", categoria_id: "cat_hogar", nombre: "Otros hogar", orden: 7 },

    { id: "sub_rr_salida", categoria_id: "cat_restaurantes_rappi", nombre: "Salidas a comer por fuera restaurantes", orden: 1 },
    { id: "sub_rr_rappi", categoria_id: "cat_restaurantes_rappi", nombre: "Pedidos Rappi y otros", orden: 2 },

    { id: "sub_cs_netflix", categoria_id: "cat_cuotas_suscripciones", nombre: "Netflix TC", orden: 1 },
    { id: "sub_cs_spotify", categoria_id: "cat_cuotas_suscripciones", nombre: "Spotify", orden: 2 },
    { id: "sub_cs_icloud", categoria_id: "cat_cuotas_suscripciones", nombre: "Apple icloud", orden: 3 },
    { id: "sub_cs_chatgpt", categoria_id: "cat_cuotas_suscripciones", nombre: "Chat Gpt plus", orden: 4 },
    { id: "sub_cs_otros", categoria_id: "cat_cuotas_suscripciones", nombre: "Otras suscripciones", orden: 5 },

    { id: "sub_personal_peluqueria", categoria_id: "cat_personal", nombre: "Peluquería u otros / tratamiento pelo Diana", orden: 1 },
    { id: "sub_personal_unas", categoria_id: "cat_personal", nombre: "Arreglo uñas Diana y Gerardo (Ana) 2 x mes", orden: 2 },
    { id: "sub_personal_gym", categoria_id: "cat_personal", nombre: "Gym Gaachinte Bodytech anual", orden: 3 },
    { id: "sub_personal_drogueria", categoria_id: "cat_personal", nombre: "Droguería o pastas vitaminas u otros", orden: 4 },
    { id: "sub_personal_prepagada", categoria_id: "cat_personal", nombre: "Salud prepagada Diana-Colmedica 25 c/mes", orden: 5 },
    { id: "sub_personal_examenes", categoria_id: "cat_personal", nombre: "Exámenes médicos / Colmedica", orden: 6 },
    { id: "sub_personal_otros", categoria_id: "cat_personal", nombre: "Otros personal", orden: 7 },
    { id: "sub_personal_ropa", categoria_id: "cat_personal", nombre: "Ropa y vestuario", orden: 8 },

    { id: "sub_perla_peluqueria", categoria_id: "cat_gastos_perla", nombre: "Peluqueria", orden: 1 },
    { id: "sub_perla_veterinaria", categoria_id: "cat_gastos_perla", nombre: "Veterinaria", orden: 2 },
    { id: "sub_perla_medicina", categoria_id: "cat_gastos_perla", nombre: "Medicina y alimentación perla", orden: 3 },

    { id: "sub_pvo_tc", categoria_id: "cat_pagos_varios_ocio", nombre: "Compras con Tc (Amazon, Mercadolibre)", orden: 1 },
    { id: "sub_pvo_lavada", categoria_id: "cat_pagos_varios_ocio", nombre: "Lavada de carro", orden: 2 },
    { id: "sub_pvo_imprevistos", categoria_id: "cat_pagos_varios_ocio", nombre: "Imprevistos", orden: 3 },
    { id: "sub_pvo_otros", categoria_id: "cat_pagos_varios_ocio", nombre: "Otros varios/ocio", orden: 4 }
  ]
};

async function obtenerCategoriasCatalogo(env) {
  return CATALOGO_FALLBACK.categorias;
}

async function obtenerSubcategoriasCatalogo(env, categoriaId) {
  return CATALOGO_FALLBACK.subcategorias.filter(
    s => s.categoria_id === categoriaId
  );
}

async function crearTecladoCategorias(env, pendingId) {
  // Telegram limita callback_data a 64 bytes.
  // Los IDs completos de algunas categorías superan ese límite al
  // concatenarlos con el UUID del pendiente. Por eso aquí usamos
  // el índice corto de la categoría y lo resolvemos al recibir el callback.
  const botones = CATALOGO_FALLBACK.categorias.map((c, i) => ({
    text: emojiCategoria(c.nombre) + " " + c.nombre,
    callback_data: `corr_cat|${pendingId}|${i}`
  }));

  botones.push({
    text: "❌ Cancelar",
    callback_data: `corr_cancel|${pendingId}`
  });

  return { inline_keyboard: agruparEnDosColumnas(botones) };
}

async function crearTecladoSubcategorias(env, pendingId, categoriaId) {
  const subcategorias = CATALOGO_FALLBACK.subcategorias
    .filter(s => s.categoria_id === categoriaId);

  const botones = subcategorias.map((s, i) => ({
    text: s.nombre,
    callback_data: `corr_sub|${pendingId}|${i}`
  }));

  botones.push({
    text: "↩️ Volver a categorías",
    callback_data: `corr_back|${pendingId}`
  });
  botones.push({
    text: "❌ Cancelar",
    callback_data: `corr_cancel|${pendingId}`
  });

  return { inline_keyboard: agruparEnDosColumnas(botones) };
}

function agruparEnDosColumnas(botones) {
  const filas = [];
  for (let i = 0; i < botones.length; i += 2) {
    filas.push(botones.slice(i, i + 2));
  }
  return filas;
}

function emojiCategoria(nombre) {
  const t = normalizar(nombre);
  if (t === "hogar") return "🏠";
  if (t.includes("restaurantes")) return "🍽️";
  if (t.includes("cuotas")) return "🔄";
  if (t === "personal") return "👤";
  if (t.includes("perla")) return "🐶";
  return "📦";
}

// ============================================================
// D1 - PENDIENTES, GASTOS Y APRENDIZAJES
// ============================================================

async function obtenerPendientePorId(env, id, chatId) {
  if (!env.DB) return null;
  return await env.DB.prepare(`SELECT * FROM pendientes WHERE id = ? AND chat_id = ? AND estado IN ('pendiente', 'corrigiendo_categoria', 'corrigiendo_datos', 'procesando', 'foto_pendiente', 'foto_descripcion') LIMIT 1`).bind(id, String(chatId)).first();
}

async function actualizarEstadoPendiente(env, id, estado) {
  if (!env.DB) return;
  await env.DB.prepare(`UPDATE pendientes SET estado = ? WHERE id = ?`).bind(estado, id).run();
}

async function marcarPendienteCorrigiendoConInterpretacion(env, id, interpretacion) {
  if (!env.DB) return;
  await env.DB.prepare(`UPDATE pendientes SET interpretacion_json = ?, estado = 'corrigiendo_categoria' WHERE id = ?`).bind(JSON.stringify(interpretacion), id).run();
}

async function aplicarCorreccionCatalogo(env, pendingId, interpretacion, indice, correccion) {
  const movimiento = interpretacion.movimientos[indice];
  const anterior = { categoria: movimiento.categoria, subcategoria: movimiento.subcategoria };
  movimiento.categoria = correccion.categoria.nombre;
  movimiento.subcategoria = correccion.subcategoria.nombre;
  movimiento.confianza = "alta";
  interpretacion._correccion = {
    categoria_anterior: anterior,
    categoria_corregida: { categoria: correccion.categoria.nombre, subcategoria: correccion.subcategoria.nombre, categoria_id: correccion.categoria.id, subcategoria_id: correccion.subcategoria.id },
    tipo: "correccion_categoria",
    movimiento_index: indice
  };
  if (interpretacion.movimientos.length === 1) {
    interpretacion.categoria = movimiento.categoria;
    interpretacion.subcategoria = movimiento.subcategoria;
    interpretacion.confianza_categoria = "alta";
  }
  interpretacion.estado = "pendiente";
  delete interpretacion._correccion_contexto;
  await actualizarPendienteInterpretacion(env, pendingId, interpretacion);
}

async function obtenerPendienteActivo(env, chatId) {
  if (!env.DB) return null;

  const result = await env.DB.prepare(`
    SELECT *
    FROM pendientes
    WHERE chat_id = ? AND estado IN ('pendiente', 'corrigiendo_categoria', 'corrigiendo_datos', 'foto_pendiente', 'foto_descripcion')
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(String(chatId)).first();

  return result || null;
}

async function obtenerPendienteCorrigiendo(env, chatId) {
  if (!env.DB) return null;

  const result = await env.DB.prepare(`
    SELECT *
    FROM pendientes
    WHERE chat_id = ? AND estado IN ('corrigiendo_categoria', 'corrigiendo_datos')
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(String(chatId)).first();

  return result || null;
}

async function buscarPosibleDuplicado(env, chatId, resultado, textoOriginal) {
  if (!env.DB || !resultado?.movimientos?.length || resultado.monto == null) return null;

  try {
    // Regla definitiva para gastos escritos manualmente:
    // misma FECHA + mismo MONTO = posible repetido, sin importar descripción,
    // comercio, persona ni texto original. Es solo una ALERTA: el usuario
    // decide si lo guarda o lo descarta.
    const actualFecha = normalizarFechaRegistro(resultado.fecha) || String(resultado.fecha || '').trim();
    const actualMonto = Number(resultado.monto);
    if (!actualFecha || !Number.isFinite(actualMonto) || actualMonto <= 0) return null;

    const rows = await env.DB.prepare(`
      SELECT g.id, g.fecha, g.monto_total, g.mensaje_original,
             i.concepto, i.detalle, i.comercio, i.persona,
             i.categoria, i.subcategoria
      FROM gastos g
      LEFT JOIN gasto_items i ON i.gasto_id = g.id
      WHERE g.chat_id = ?
        AND g.estado = 'confirmado'
      ORDER BY g.fecha DESC, g.created_at DESC
      LIMIT 500
    `).bind(String(chatId)).all();

    const anteriores = rows?.results || [];
    const coincidencias = [];

    for (const row of anteriores) {
      // También normalizamos la fecha almacenada para que una versión antigua
      // que hubiera guardado "15 de agosto" siga siendo detectada como
      // 2026-08-15.
      const fechaAnterior = normalizarFechaRegistro(row?.fecha) || String(row?.fecha || '').trim();
      const montoAnterior = Number(row?.monto_total);

      if (fechaAnterior !== actualFecha) continue;
      if (!Number.isFinite(montoAnterior) || montoAnterior !== actualMonto) continue;

      coincidencias.push({
        id: row.id,
        fecha: fechaAnterior,
        monto: montoAnterior,
        concepto: row.concepto || '',
        detalle: row.detalle || '',
        comercio: row.comercio || '',
        persona: row.persona || '',
        categoria: row.categoria || '',
        subcategoria: row.subcategoria || '',
        mensaje_original: row.mensaje_original || ''
      });

      // No necesitamos recorrer indefinidamente si hay muchas coincidencias.
      if (coincidencias.length >= 10) break;
    }

    if (!coincidencias.length) return null;

    return {
      tipo: 'fecha+monto',
      cantidad: coincidencias.length,
      coincidencias
    };
  } catch (error) {
    // Una falla del detector nunca debe impedir registrar un gasto.
    console.log("ERROR BUSCANDO POSIBLE DUPLICADO", error?.stack || error);
  }

  return null;
}

async function guardarPendiente(env, id, chatId, textoOriginal, resultado, reemplazarAnteriores = true, estado = "pendiente") {
  if (!env.DB) throw new Error("Falta binding D1: DB");

  if (reemplazarAnteriores) {
    await reemplazarPendientesAnteriores(env, chatId);
  }

  await env.DB.prepare(`
    INSERT INTO pendientes
      (id, chat_id, mensaje_original, interpretacion_json, estado)
    VALUES (?, ?, ?, ?, ?)
  `).bind(
    id,
    String(chatId),
    textoOriginal,
    JSON.stringify(resultado),
    estado
  ).run();
}

async function reemplazarPendientesAnteriores(env, chatId) {
  if (!env.DB) return;

  await env.DB.prepare(`
    UPDATE pendientes
    SET estado = 'reemplazado'
    WHERE chat_id = ?
      AND estado IN ('pendiente', 'corrigiendo_categoria', 'corrigiendo_datos')
  `).bind(String(chatId)).run();
}

async function marcarPendienteCorrigiendo(env, id) {
  if (!env.DB) return;

  await env.DB.prepare(`
    UPDATE pendientes
    SET estado = 'corrigiendo_categoria'
    WHERE id = ?
  `).bind(id).run();
}

async function actualizarPendienteInterpretacion(env, id, interpretacion) {
  if (!env.DB) return;

  await env.DB.prepare(`
    UPDATE pendientes
    SET interpretacion_json = ?, estado = 'pendiente'
    WHERE id = ?
  `).bind(JSON.stringify(interpretacion), id).run();
}

async function marcarPendienteConfirmado(env, id) {
  if (!env.DB) return;

  await env.DB.prepare(`
    UPDATE pendientes
    SET estado = 'confirmado'
    WHERE id = ?
  `).bind(id).run();
}

async function guardarGastoConfirmado(env, chatId, resultado, pendingId = null) {
  if (!env.DB) throw new Error("Falta binding D1: DB");

  const gastoId = crypto.randomUUID();
  const statements = [];

  statements.push(env.DB.prepare(`
    INSERT INTO gastos
      (id, chat_id, tipo, mensaje_original, fecha, monto_total, moneda, estado)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmado')
  `).bind(
    gastoId,
    String(chatId),
    resultado.tipo || "gasto",
    resultado.mensaje_original || "",
    normalizarFechaRegistro(resultado.fecha) || resultado.fecha,
    Number(resultado.monto),
    resultado.moneda || "COP"
  ));

  // Los pendientes originados en una foto representan una sola fila bancaria.
  // Defensa adicional: aunque un dato antiguo, una corrección o una versión
  // previa haya dejado más de un movimiento dentro del JSON, NUNCA guardamos
  // esos movimientos extra. El monto válido de la foto es resultado.monto.
  const movimientosGuardar = resultado._fuente === "foto_banco"
    ? [(resultado.movimientos || [])[0] || {}]
    : (resultado.movimientos || []);

  for (const movimiento of movimientosGuardar) {
    const itemId = crypto.randomUUID();
    const categoriaLocal = CATALOGO_FALLBACK.categorias.find(c => c.nombre === movimiento.categoria);
    const catalogoLocal = CATALOGO_FALLBACK.subcategorias.find(
      s => s.nombre === movimiento.subcategoria && s.categoria_id === categoriaLocal?.id
    );

    statements.push(env.DB.prepare(`
      INSERT INTO gasto_items
        (id, gasto_id, concepto, detalle, monto, cantidad, comercio,
         canal, forma_pago, persona, categoria, subcategoria,
         periodicidad, confianza, categoria_id, subcategoria_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      itemId,
      gastoId,
      (resultado._fuente === "foto_banco" && !resultado._descripcion_usuario && resultado._descripcion_banco
        ? resultado._descripcion_banco
        : (movimiento.concepto || movimiento.detalle || null)),
      movimiento.detalle || null,
      resultado._fuente === "foto_banco"
        ? Number(resultado.monto || 0)
        : Number(movimiento.monto || 0),
      movimiento.cantidad ?? null,
      movimiento.comercio || null,
      detectarCanal(movimiento.detalle || movimiento.concepto || ""),
      movimiento.forma_pago || null,
      movimiento.persona || null,
      movimiento.categoria || null,
      movimiento.subcategoria || null,
      resultado.periodicidad || null,
      convertirConfianza(movimiento.confianza),
      categoriaLocal?.id || null,
      catalogoLocal?.id || null
    ));
  }

  if (pendingId) {
    statements.push(env.DB.prepare(`
      UPDATE pendientes SET estado = 'confirmado' WHERE id = ?
    `).bind(pendingId));
  }

  if (typeof env.DB.batch === "function") {
    await env.DB.batch(statements);
  } else {
    // Fallback para runtimes sin batch; normalmente D1 sí lo soporta.
    for (const statement of statements) await statement.run();
  }

  return gastoId;
}

async function guardarAprendizajeSiExiste(env, chatId, pendiente, resultado) {
  if (!env.DB) return;

  const correccion = resultado?._correccion;

  // Solo las correcciones de categoría alimentan el aprendizaje automático.
  // Una corrección de datos es una edición puntual y no debe convertirse en una regla.
  if (!correccion || correccion.tipo !== "correccion_categoria") return;

  const aprendizajeId = crypto.randomUUID();

  await env.DB.prepare(`
    INSERT INTO aprendizajes
      (id, chat_id, texto_original, interpretacion_json, correccion_json, tipo)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    aprendizajeId,
    String(chatId),
    pendiente.mensaje_original,
    pendiente.interpretacion_json,
    JSON.stringify(correccion),
    correccion.tipo
  ).run();
}

async function aplicarAprendizajes(env, chatId, resultado) {
  if (!env.DB || !resultado?.movimientos?.length) return resultado;

  try {
    const rows = await env.DB.prepare(`
      SELECT id, texto_original, correccion_json
      FROM aprendizajes
      WHERE chat_id = ?
      ORDER BY created_at DESC
      LIMIT 20
    `).bind(String(chatId)).all();

    const aprendizajes = rows?.results || [];
    if (!aprendizajes.length) return resultado;

    for (const movimiento of resultado.movimientos) {
      const mejor = encontrarAprendizajeSimilar(
        movimiento,
        resultado.mensaje_original,
        aprendizajes,
        movimiento.confianza
      );

      if (!mejor) continue;

      // Una coincidencia específica y fuerte del motor actual debe tener
      // prioridad sobre un aprendizaje genérico. Un aprendizaje solo puede
      // reemplazar una clasificación de alta confianza cuando el texto
      // actual coincide exactamente con el texto que el usuario corrigió.
      if (movimiento.confianza === "alta") {
        const actual = normalizar(`${movimiento.concepto || ""} ${movimiento.detalle || ""} ${resultado.mensaje_original || ""}`).trim();
        const aprendido = normalizar(mejor.aprendizaje.texto_original || "").trim();
        if (actual !== aprendido) continue;
      }

      const correccion = JSON.parse(mejor.aprendizaje.correccion_json || "{}");
      const destino = correccion.categoria_corregida;

      if (!destino?.categoria || !destino?.subcategoria) continue;

      movimiento.categoria = destino.categoria;
      movimiento.subcategoria = destino.subcategoria;
      movimiento.confianza = "alta";
    }

    if (resultado.movimientos.length === 1) {
      resultado.categoria = resultado.movimientos[0].categoria;
      resultado.subcategoria = resultado.movimientos[0].subcategoria;
      resultado.confianza_categoria = resultado.movimientos[0].confianza;
    }

    return resultado;
  } catch (error) {
    console.log("ERROR CONSULTANDO APRENDIZAJES", error);
    return resultado;
  }
}

function encontrarAprendizajeSimilar(movimiento, mensaje, aprendizajes, confianzaActual = "media") {
  const textoActual = normalizar(
    `${movimiento.concepto || ""} ${movimiento.detalle || ""} ${mensaje || ""}`
  );

  const tokensActuales = tokensSignificativos(textoActual);
  if (!tokensActuales.length) return null;

  let mejor = null;
  let mejorPuntaje = 0;

  for (const aprendizaje of aprendizajes) {
    const textoAprendizaje = normalizar(aprendizaje.texto_original || "");
    const tokensAprendizaje = tokensSignificativos(textoAprendizaje);

    const comunes = tokensAprendizaje.filter(
      token => tokensActuales.includes(token)
    );

    if (!comunes.length) continue;

    let puntaje = comunes.length;

    // Una palabra distintiva larga puede ser suficiente para recuperar
    // una corrección específica.
    if (comunes.some(t => t.length >= 7)) puntaje += 2;

    if (textoActual === textoAprendizaje) puntaje += 10;

    // Si el clasificador actual no encontró una coincidencia fuerte
    // (normalmente cae en "Otros"), permitimos que un aprendizaje
    // confirmado se generalice desde una sola palabra significativa.
    // Ejemplo: "aseo Ana" corregido a "Ana aseo" debe enseñar que
    // futuros mensajes como "aseo de apartamento" corresponden a
    // "Ana aseo 2 veces al mes".
    const coincidenciaUnicaValida =
      comunes.length === 1 &&
      comunes[0].length >= 4 &&
      confianzaActual !== "alta";

    if (puntaje > mejorPuntaje && (puntaje >= 2 || coincidenciaUnicaValida)) {
      mejorPuntaje = puntaje;
      mejor = { aprendizaje, puntaje };
    }
  }

  return mejor;
}

function tokensSignificativos(texto) {
  const stop = new Set([
    "hoy", "ayer", "antier", "anoche", "compre", "compré",
    "compras", "comprar", "pague", "pagué", "pago", "gaste",
    "gasté", "gasto", "por", "para", "con", "una", "uno",
    "unos", "unas", "los", "las", "del", "que", "debe",
    "quedar", "quede", "de", "en", "el", "la", "y", "e",
    "mil", "pesos", "cop", "tc"
  ]);

  return [...new Set(
    texto
      .split(/[^a-z0-9áéíóúñ]+/i)
      .filter(token => token.length >= 4 && !stop.has(token))
  )];
}

// ============================================================
// CORRECCIÓN DE CATEGORÍA / SUBCATEGORÍA
// ============================================================

async function interpretarCorreccionCategoriaDesdeCatalogo(env, texto) {
  const t = normalizar(texto);
  const categorias = CATALOGO_FALLBACK.categorias;
  const subcategorias = CATALOGO_FALLBACK.subcategorias;

  let mejorSub = null;
  let mejorPuntaje = 0;

  for (const row of subcategorias) {
    const nombreSub = normalizar(row.nombre);
    let puntaje = 0;

    if (t.includes(nombreSub)) puntaje += 100;
    if (contienePalabraExacta(t, nombreSub)) puntaje += 100;

    const comunes = tokensSignificativos(nombreSub)
      .filter(token => contienePalabraExacta(t, token));
    puntaje += comunes.length * 5;

    if (
      row.id === "sub_hogar_mercado" &&
      contienePalabraExacta(t, "mercado")
    ) puntaje += 50;

    if (
      row.id === "sub_cs_otros" &&
      (contienePalabraExacta(t, "suscripcion") ||
       contienePalabraExacta(t, "suscripciones"))
    ) puntaje += 50;

    if (puntaje > mejorPuntaje) {
      mejorPuntaje = puntaje;
      mejorSub = row;
    }
  }

  if (mejorSub && mejorPuntaje >= 10) {
    const cat = categorias.find(c => c.id === mejorSub.categoria_id);
    return {
      tipo: "subcategoria",
      categoria: {
        id: mejorSub.categoria_id,
        nombre: cat?.nombre || ""
      },
      subcategoria: {
        id: mejorSub.id,
        nombre: mejorSub.nombre
      }
    };
  }

  let mejorCat = null;
  let mejorCatPuntaje = 0;

  for (const row of categorias) {
    const nombreCat = normalizar(row.nombre);
    let puntaje = 0;

    if (t.includes(nombreCat)) puntaje += 100;
    if (contienePalabraExacta(t, nombreCat)) puntaje += 100;

    puntaje += tokensSignificativos(nombreCat)
      .filter(token => contienePalabraExacta(t, token)).length * 5;

    if (puntaje > mejorCatPuntaje) {
      mejorCatPuntaje = puntaje;
      mejorCat = row;
    }
  }

  if (mejorCat && mejorCatPuntaje >= 10) {
    return {
      tipo: "categoria",
      categoria: {
        id: mejorCat.id,
        nombre: mejorCat.nombre
      }
    };
  }

  return null;
}

function extraerNumeroMovimiento(texto) {
  const m = texto.match(/\b(?:movimiento|item|ítem|gasto)\s*(\d+)\b/i);
  return m ? Number(m[1]) : null;
}

// ============================================================
// FILTRO DE INTENCIÓN
// ============================================================

function esSaludo(texto) {
  const saludos = [
    "hola", "holi", "buenas", "buenos dias", "buenas tardes",
    "buenas noches", "hey", "hello", "gracias", "muchas gracias"
  ];

  return saludos.includes(texto);
}

function esSolicitudAyuda(texto) {
  return [
    "ayuda", "que puedes hacer", "que haces", "como funciona",
    "como te uso", "que haces tu"
  ].some(p => texto === p || texto.includes(p));
}

function esPosibleGasto(texto) {
  if (!texto) return false;

  // Intenciones futuras no son gastos.
  if (/\b(?:quiero|voy a|pienso|planeo|me gustaria|me gustaría|necesito comprar)\b/i.test(texto)) {
    return false;
  }

  // Verbos/frases claros de gasto.
  const verbosGasto = [
    "compre", "compré", "compramos", "compro", "compró",
    "pague", "pagué", "pago", "gasté", "gaste", "gasto",
    "gastamos", "pedido", "pedí", "pedi", "pagamos",
    "me costo", "me costó", "costó", "coste"
  ];

  if (verbosGasto.some(v => contienePalabraExacta(texto, normalizar(v)))) {
    return true;
  }

  // También aceptamos mensajes muy cortos del estilo:
  // "mercado 200.000", "panaderia 50.000", etc.
  const tieneMonto = /\b\d{1,3}(?:[.,]\d{3})+\b|\b\d+\s*(?:mil|k)\b/i.test(texto);

  const conceptosGasto = [
    "mercado", "panaderia", "panadería", "restaurante", "comida",
    "rappi", "farmatodo", "medicamentos", "medicamento",
    "netflix", "spotify", "icloud", "ropa", "zapatos", "tenis",
    "pantalon", "pantalón", "cafetera", "compra", "compras",
    "carro", "veterinaria", "peluqueria", "peluquería", "gym"
  ];

  return tieneMonto &&
    conceptosGasto.some(p => contienePalabraExacta(texto, normalizar(p)));
}

function detectarCanal(texto) {
  const t = normalizar(texto);
  if (contienePalabraExacta(t, "rappi") || contienePalabraExacta(t, "rappi turbo")) {
    return "Rappi";
  }
  return null;
}

function convertirConfianza(confianza) {
  if (confianza === "alta") return 1;
  if (confianza === "media") return 0.5;
  if (confianza === "baja") return 0.25;
  return null;
}


// ============================================================
// ENVIAR MENSAJE A TELEGRAM
// ============================================================

async function enviarTelegram(
  env,
  chatId,
  texto,
  replyMarkup = null
) {
  if (
    !env.TELEGRAM_BOT_TOKEN
  ) {
    console.log(
      "Falta TELEGRAM_BOT_TOKEN"
    );

    return;
  }

  if (!chatId) {
    console.log(
      "Falta chatId"
    );

    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  let response;
  try {
    response = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: texto,
          ...(replyMarkup ? { reply_markup: replyMarkup } : {})
        }),
        signal: controller.signal
      }
    );
  } finally {
    clearTimeout(timeout);
  }

  const resultado =
    await response.text();

  console.log(
    "RESPUESTA TELEGRAM:"
  );

  console.log(
    resultado
  );
}


// ============================================================
// CREAR RESPUESTA DE GASTO
// ============================================================

function crearRespuestaGasto(resultado) {
  let respuesta = "🔎 Gasto detectado\n\n";

  if (resultado.monto !== null) {
    respuesta += `💰 Monto total: ${formatearPesos(resultado.monto)}\n`;
  } else {
    respuesta += "💰 Monto: No identificado\n";
  }

  respuesta += `📅 Fecha: ${formatearFecha(resultado.fecha)}\n`;

  if (resultado.movimientos.length === 1) {
    const m = resultado.movimientos[0];
    // Mostramos explícitamente qué concepto se va a guardar en gasto_items.
    // Esto permite verificar la interpretación antes de confirmar.
    if (m.concepto) respuesta += `📝 Descripción: ${capitalizar(m.concepto)}\n`;
    if (m.comercio) respuesta += `🏪 Comercio: ${m.comercio}\n`;
    if (m.persona) respuesta += `👤 Persona: ${m.persona}\n`;
    respuesta += `📂 Categoría: ${m.categoria}\n`;
    respuesta += `📁 Subcategoría: ${m.subcategoria}\n`;
  } else {
    respuesta += "\n🧾 Movimientos:\n";

    resultado.movimientos.forEach((m, index) => {
      respuesta += `\n${index + 1}. 📝 ${capitalizar(m.concepto || "Movimiento")}\n`;
      if (m.cantidad) respuesta += `   🔢 Cantidad: ${m.cantidad}\n`;
      if (m.monto !== null) respuesta += `   💰 ${formatearPesos(m.monto)}\n`;
      if (m.comercio) respuesta += `   🏪 ${m.comercio}\n`;
      if (m.persona) respuesta += `   👤 ${m.persona}\n`;
      respuesta += `   📂 ${m.categoria} → ${m.subcategoria}\n`;
    });
  }

  respuesta += "\n";

  if (resultado.monto === null) {
    respuesta += "❓ ¿Cuál fue el valor del gasto?";
    return respuesta;
  }

  if (resultado.estado === "requiere_revision") {
    respuesta += "⚠️ Hay un dato que necesita revisión.\n";
    respuesta += "Escríbeme el dato que falta o corrige la información.";
    return respuesta;
  }

  respuesta += "¿Está correcto?";
  return respuesta;
}

function capitalizar(texto) {
  if (!texto) return "";
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// ============================================================
// FORMATEAR PESOS
// ============================================================

function formatearPesos(
  valor
) {
  return (
    "$" +
    new Intl.NumberFormat(
      "es-CO"
    ).format(valor) +
    " COP"
  );
}


// ============================================================
// FORMATEAR FECHA
// ============================================================

function claveMovimientoReporte(r) {
  const fecha = normalizarFechaRegistro(r?.fecha) || String(r?.fecha || '').trim().toLowerCase();
  const monto = Number(r?.monto || 0);
  const comercio = normalizar(String(r?.comercio || ''));
  const concepto = normalizar(String(r?.concepto || ''));
  const detalle = normalizar(String(r?.detalle || ''));
  return `${fecha}|${monto}|${comercio}|${concepto}|${detalle}`;
}

function deduplicarMovimientosReporte(rows) {
  const vistos = new Set();
  const salida = [];
  for (const r of (rows || [])) {
    const clave = claveMovimientoReporte(r);
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    salida.push(r);
  }
  return salida;
}

function normalizarFechaRegistro(fecha) {
  if (fecha === null || fecha === undefined) return null;

  let valor = String(fecha).trim();
  if (!valor) return null;

  // ISO YYYY-MM-DD.
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    return fechaISOValida(valor) ? valor : null;
  }

  const meses = {
    enero:1, febrero:2, marzo:3, abril:4, mayo:5, junio:6,
    julio:7, agosto:8, septiembre:9, setiembre:9, octubre:10,
    noviembre:11, diciembre:12,
    ene:1, feb:2, mar:3, abr:4, may:5, jun:6, jul:7,
    ago:8, sep:9, sept:9, set:9, oct:10, nov:11, dic:12
  };

  // Normalización amplia para fechas que aparecen en Banco de Bogotá y otros
  // estados bancarios: "7 sep 2026", "7 sep. 2026", "7 sept. 2026",
  // "Dom. 7 sep 2026", "7 de sep de 2026", etc.
  let v = valor
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Quitar día de la semana, tanto completo como abreviado y con punto.
  v = v.replace(/^(?:domingo|lunes|martes|miercoles|jueves|viernes|sabado|sábado|dom|lun|mar|mie|mié|jue|vie|sab)\.?\s+/i, "").trim();

  // Quitar puntos de abreviaturas de mes: "sep." -> "sep".
  v = v.replace(/\b(ene|feb|mar|abr|may|jun|jul|ago|sep|sept|set|oct|nov|dic)\.(?=\s|$)/gi, "$1");

  // Tolerar "de", "del", "del año", etc. sin cambiar el significado.
  v = v.replace(/\bdel\s+(?=20\d{2})/g, "de ");
  v = v.replace(/\s+/g, " ").trim();

  const anioActual = Number(fechaLocalISO().slice(0, 4));
  const nombresMes = Object.keys(meses).join("|");

  // Día + mes + año: "7 sep 2026", "7 de sep de 2026",
  // "7 septiembre 2026", etc.
  let m = v.match(new RegExp(
    "^(\\d{1,2})\\s+(?:de\\s+)?(" + nombresMes + ")\\s+(?:de\\s+)?(20\\d{2})$",
    "i"
  ));
  if (m) {
    const fechaISO = `${m[3]}-${String(meses[m[2].toLowerCase()]).padStart(2,"0")}-${String(Number(m[1])).padStart(2,"0")}`;
    return fechaISOValida(fechaISO) ? fechaISO : null;
  }

  // Día + mes sin año: usa el año actual de Colombia.
  m = v.match(new RegExp(
    "^(\\d{1,2})\\s+(?:de\\s+)?(" + nombresMes + ")$",
    "i"
  ));
  if (m) {
    const fechaISO = `${anioActual}-${String(meses[m[2].toLowerCase()]).padStart(2,"0")}-${String(Number(m[1])).padStart(2,"0")}`;
    return fechaISOValida(fechaISO) ? fechaISO : null;
  }

  // Formatos numéricos: 07/09/2026, 07-09-2026, 07.09.2026,
  // y 07/09 sin año.
  m = v.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](20\d{2}))?$/);
  if (m) {
    const anio = Number(m[3] || anioActual);
    const fechaISO = `${anio}-${String(Number(m[2])).padStart(2,"0")}-${String(Number(m[1])).padStart(2,"0")}`;
    return fechaISOValida(fechaISO) ? fechaISO : null;
  }

  // Mes + día, tolerancia adicional.
  m = v.match(new RegExp(
    "^(" + nombresMes + ")\\s+(\\d{1,2})(?:\\s+(?:de\\s+)?(20\\d{2}))?$",
    "i"
  ));
  if (m) {
    const anio = Number(m[3] || anioActual);
    const fechaISO = `${anio}-${String(meses[m[1].toLowerCase()]).padStart(2,"0")}-${String(Number(m[2])).padStart(2,"0")}`;
    return fechaISOValida(fechaISO) ? fechaISO : null;
  }

  return null;
}

// Repara registros históricos que alguna versión anterior pudo guardar con
// fechas visibles en lugar de ISO. Es idempotente: los registros que ya están
// en YYYY-MM-DD no se modifican. El año faltante se interpreta como el año
// actual, que es la convención usada para las capturas bancarias del año actual.
async function normalizarFechasGastosExistentes(env, chatId) {
  if (!env.DB) return 0;

  try {
    const rows = (await env.DB.prepare(`
      SELECT id, fecha
      FROM gastos
      WHERE chat_id = ? AND estado = 'confirmado'
    `).bind(String(chatId)).all()).results || [];

    let corregidos = 0;
    for (const row of rows) {
      const original = String(row?.fecha || "").trim();
      if (!original || /^\d{4}-\d{2}-\d{2}$/.test(original)) continue;

      const normalizada = normalizarFechaRegistro(original);
      if (!normalizada || normalizada === original) continue;

      await env.DB.prepare(`UPDATE gastos SET fecha = ? WHERE id = ?`)
        .bind(normalizada, row.id)
        .run();
      corregidos++;
    }

    if (corregidos) console.log(`FECHAS HISTORICAS NORMALIZADAS: ${corregidos}`);
    return corregidos;
  } catch (error) {
    console.log("ERROR NORMALIZANDO FECHAS HISTORICAS", error?.stack || error);
    return 0;
  }
}

function formatearFecha(
  fecha
) {
  if (!fecha) return "No identificada";

  let valor = String(fecha).trim();
  const meses = {
    enero:1, febrero:2, marzo:3, abril:4, mayo:5, junio:6, julio:7, agosto:8,
    septiembre:9, setiembre:9, octubre:10, noviembre:11, diciembre:12,
    ene:1, feb:2, mar:3, abr:4, may:5, jun:6, jul:7, ago:8, sep:9, oct:10, nov:11, dic:12
  };

  let year, month, day;
  let m = valor.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    year=Number(m[1]); month=Number(m[2]); day=Number(m[3]);
  } else {
    m = valor.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/^(\d{1,2})\s+(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)(?:\s+(?:de|del)\s+)?(\d{4})$/);
    if (m) { day=Number(m[1]); month=meses[m[2]]; year=Number(m[3]); }
  }

  if (!year || !month || !day) return valor;
  const fechaObj = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (fechaObj.getUTCFullYear() !== year || fechaObj.getUTCMonth() !== month - 1 || fechaObj.getUTCDate() !== day) return valor;

  return new Intl.DateTimeFormat("es-CO", { day:"numeric", month:"long", year:"numeric", timeZone:"UTC" }).format(fechaObj);
}


// ============================================================
// MOTOR DE INTERPRETACIÓN - VERSIÓN MAESTRA
// ============================================================

function interpretarGasto(texto) {
  const textoOriginal = (texto || "").trim();
  const textoNormalizado = normalizar(textoOriginal);

  const fecha = obtenerFecha(textoNormalizado);
  const personaGlobal = extraerPersonaGlobal(textoOriginal, textoNormalizado);

  const partes = construirMovimientos(textoOriginal);

  const movimientos = partes.map((parte) => {
    const t = normalizar(parte.texto);
    const categoria = clasificarCategoria(t);

    return {
      concepto: limpiarConcepto(parte.texto),
      detalle: limpiarTexto(parte.texto),
      monto: parte.monto,
      cantidad: parte.cantidad || null,
      comercio: parte.comercio || null,
      forma_pago: parte.formaPago || null,
      persona: parte.persona || personaGlobal || null,
      categoria: categoria.categoria,
      subcategoria: categoria.subcategoria,
      confianza: categoria.confianza
    };
  });

  const montoTotal = movimientos.length && movimientos.every(m => m.monto !== null)
    ? movimientos.reduce((total, m) => total + m.monto, 0)
    : null;

  // Si hay un solo movimiento, sus datos se muestran arriba como resumen.
  // En múltiples movimientos, cada dato se conserva dentro del movimiento.
  const movimientoUnico = movimientos.length === 1 ? movimientos[0] : null;

  const requiereRevision =
    montoTotal === null ||
    movimientos.some(m => !m.categoria || !m.subcategoria);

  return {
    tipo: "gasto",
    mensaje_original: textoOriginal,
    monto: montoTotal,
    moneda: "COP",
    fecha,
    comercio: movimientoUnico?.comercio || null,
    forma_pago: movimientoUnico?.forma_pago || null,
    persona: personaGlobal || movimientoUnico?.persona || null,
    periodicidad: null,
    movimientos,
    categoria: movimientoUnico?.categoria || null,
    subcategoria: movimientoUnico?.subcategoria || null,
    confianza_categoria: movimientoUnico?.confianza || "media",
    estado: requiereRevision ? "requiere_revision" : "pendiente"
  };
}


// ============================================================
// CONSTRUIR MOVIMIENTOS
// ============================================================

function construirMovimientos(textoOriginal) {
  const montos = extraerMontos(textoOriginal);

  if (!montos.length) {
    return [{
      texto: textoOriginal,
      monto: null,
      cantidad: extraerCantidad(textoOriginal),
      comercio: extraerComercio(textoOriginal, normalizar(textoOriginal)),
      formaPago: extraerFormaPago(normalizar(textoOriginal)),
      persona: extraerPersona(textoOriginal, normalizar(textoOriginal))
    }];
  }

  // Propina: forma parte del mismo gasto, nunca se crea un movimiento aparte.
  if (/\bpropina\b/i.test(normalizar(textoOriginal)) && montos.length === 2) {
    const propinaIndex = normalizar(textoOriginal).indexOf("propina");
    const principal = montos.find(m => m.inicio < propinaIndex);
    const propina = montos.find(m => m.inicio >= propinaIndex);

    if (principal && propina) {
      return [{
        texto: textoOriginal,
        monto: principal.valor + propina.valor,
        cantidad: extraerCantidad(textoOriginal),
        comercio: extraerComercio(textoOriginal, normalizar(textoOriginal)),
        formaPago: extraerFormaPago(normalizar(textoOriginal)),
        persona: extraerPersona(textoOriginal, normalizar(textoOriginal))
      }];
    }
  }

  // Creamos un segmento alrededor de cada monto.
  const segmentos = montos.map((monto, index) => {
    const inicio = index === 0 ? 0 : montos[index - 1].fin;
    const fin = monto.fin;
    let texto = textoOriginal.slice(inicio, fin).trim();

    // Quitamos conectores que pertenecen a la unión de movimientos.
    if (index > 0) {
      texto = texto.replace(/^(?:y|e|ademas|despues|luego)\s+/i, "");
    }

    return {
      texto,
      monto: monto.valor,
      cantidad: extraerCantidad(texto),
      inicioMonto: monto.inicio,
      finMonto: monto.fin
    };
  });

  // El primer segmento puede contener una introducción antes del producto.
  // Se limpia posteriormente, sin alterar el mensaje original almacenado.
  const comercios = extraerComerciosConPosicion(textoOriginal);
  const pagos = extraerPagosConPosicion(textoOriginal);
  const personas = extraerPersonasConPosicion(textoOriginal);

  segmentos.forEach((segmento, index) => {
    segmento.comercio = comercioParaSegmento(segmento, segmentos, comercios);
    segmento.formaPago = pagoParaSegmento(segmento, segmentos, pagos, index);
    segmento.persona = personaParaSegmento(segmento, segmentos, personas);
  });

  return segmentos;
}


// ============================================================
// MONTOS - SOLO VALORES MONETARIOS, NO CANTIDADES
// ============================================================

function extraerMontos(texto) {
  if (!texto) return [];

  const t = texto.toLowerCase().replace(/\$/g, "");
  const resultados = [];
  const ocupados = [];
  const cantidades = detectarRangosDeCantidad(t);
  const fechas = detectarRangosDeFecha(t);

  // 380 mil / 380mil / 380 k / 380k
  const regexMil = /\b(\d+(?:[.,]\d+)?)\s*(mil|k)\b/gi;
  let match;

  while ((match = regexMil.exec(t)) !== null) {
    let n = match[1];
    if (n.includes(".") && n.includes(",")) {
      n = n.replace(/\./g, "").replace(",", ".");
    } else if (n.includes(",")) {
      n = n.replace(",", ".");
    }

    const valor = Math.round(parseFloat(n) * 1000);
    if (!isNaN(valor)) {
      resultados.push({
        valor,
        inicio: match.index,
        fin: regexMil.lastIndex,
        texto: match[0]
      });
      ocupados.push([match.index, regexMil.lastIndex]);
    }
  }

  // 180.000 / 1.200.000 / 180000
  const regexNumero = /\b\d{1,3}(?:[.,]\d{3})+\b|\b\d+\b/g;

  while ((match = regexNumero.exec(t)) !== null) {
    const dentroDeMil = ocupados.some(([a, b]) => match.index >= a && match.index < b);
    const esCantidad = cantidades.some(([a, b]) => match.index >= a && match.index < b);
    const esFecha = fechas.some(([a, b]) => match.index >= a && match.index < b);
    if (dentroDeMil || esCantidad || esFecha) continue;

    // Un número corto seguido inmediatamente de una palabra de producto
    // es cantidad, no dinero. La detección de rangos ya cubre los casos usuales.
    let valor;
    if (/^\d{1,3}(?:[.,]\d{3})+$/.test(match[0])) {
      valor = Number(match[0].replace(/[.,]/g, ""));
    } else {
      valor = Number(match[0]);
    }

    if (!isNaN(valor)) {
      resultados.push({
        valor: Math.round(valor),
        inicio: match.index,
        fin: regexNumero.lastIndex,
        texto: match[0]
      });
    }
  }

  return resultados.sort((a, b) => a.inicio - b.inicio);
}

function extraerMonto(texto) {
  const montos = extraerMontos(texto);
  return montos.length ? montos[0].valor : null;
}

function detectarRangosDeCantidad(texto) {
  const rangos = [];
  const productos = [
    "camisa", "camisas", "pantalon", "pantalones", "zapatos", "tenis", "tennis",
    "paquete", "paquetes", "botella", "botellas", "unidad", "unidades",
    "arepa", "arepas", "huevo", "huevos", "leche", "cafe", "cafes",
    "pincel", "pinceles", "producto", "productos", "cosa", "cosas"
  ];

  const patron = new RegExp(`\\b\\d{1,3}\\s+(?:${productos.join("|")})\\b`, "gi");
  let match;
  while ((match = patron.exec(texto)) !== null) {
    rangos.push([match.index, match.index + match[0].length]);
  }
  return rangos;
}

function extraerCantidad(texto) {
  if (!texto) return null;
  const normal = normalizar(texto);
  const match = normal.match(/\b(\d{1,3})\s+(camisas?|pantalon(?:es)?|zapatos?|tenis|tennis|paquetes?|botellas?|unidades?|arepas?|huevos?|pinceles?|productos?|cosas?)\b/i);
  return match ? Number(match[1]) : null;
}


// ============================================================
// COMERCIO POR POSICIÓN
// ============================================================

function listaComercios() {
  return [
    { patrones: ["mercadolibre", "mercado libre"], nombre: "MercadoLibre" },
    { patrones: ["amazon"], nombre: "Amazon" },
    { patrones: ["rappi turbo"], nombre: "Rappi Turbo" },
    { patrones: ["farmatodo"], nombre: "Farmatodo" },
    { patrones: ["ventolini"], nombre: "Ventolini" },
    { patrones: ["carulla"], nombre: "Carulla" },
    { patrones: ["shein"], nombre: "Shein" },
    { patrones: ["pandora"], nombre: "Pandora" },
    { patrones: ["velez", "vélez"], nombre: "Vélez" },
    { patrones: ["lacoste"], nombre: "Lacoste" },
    { patrones: ["avianca"], nombre: "Avianca" },
    { patrones: ["la roca"], nombre: "La Roca" },
    { patrones: ["bodytech"], nombre: "Bodytech" },
    { patrones: ["netflix"], nombre: "Netflix" },
    { patrones: ["spotify"], nombre: "Spotify" },
    { patrones: ["icloud"], nombre: "Apple iCloud" },
    { patrones: ["chatgpt", "chat gpt"], nombre: "ChatGPT" },
    { patrones: ["el corral", "corral"], nombre: "El Corral" },
    { patrones: ["unicentro"], nombre: "Unicentro" },
    { patrones: ["jumbo"], nombre: "Jumbo" }
  ];
}

function normalizarNombreComercio(nombre) {
  if (!nombre) return null;
  const n = normalizar(nombre);
  const equivalencias = [
    [["mercadolibre", "mercado libre", "mercado-libre"], "MercadoLibre"],
    [["farmatodo"], "Farmatodo"],
    [["carulla"], "Carulla"],
    [["jumbo"], "Jumbo"],
    [["shein"], "Shein"],
    [["pandora"], "Pandora"],
    [["velez", "vélez"], "Vélez"],
    [["lacoste"], "Lacoste"],
    [["ventolini"], "Ventolini"],
    [["el corral", "corral"], "El Corral"],
    [["unicentro"], "Unicentro"],
    [["rappi turbo"], "Rappi Turbo"],
    [["rappi"], "Rappi"],
    [["amazon"], "Amazon"],
  ];
  for (const [patrones, canonico] of equivalencias) {
    if (patrones.some(p => n === normalizar(p))) return canonico;
  }
  return nombre.trim();
}

function extraerComerciosConPosicion(texto) {
  const normal = normalizar(texto);
  const lista = [];

  for (const comercio of listaComercios()) {
    for (const patron of comercio.patrones) {
      let desde = 0;
      while (true) {
        const pos = normal.indexOf(patron, desde);
        if (pos === -1) break;

        // Evita que "mercado" coincida dentro de MercadoLibre y similares.
        if (esCoincidenciaValida(normal, patron, pos)) {
          lista.push({
            nombre: comercio.nombre,
            inicio: pos,
            fin: pos + patron.length
          });
        }
        desde = pos + patron.length;
      }
    }
  }

  return lista.sort((a, b) => a.inicio - b.inicio);
}

function extraerComercio(textoOriginal, textoNormalizado) {
  const encontrados = extraerComerciosConPosicion(textoOriginal);
  if (encontrados.length) return normalizarNombreComercio(encontrados[0].nombre);

  const matchEn = textoOriginal.match(
    /\ben\s+([A-Za-zÁÉÍÓÚÑáéíóúñ][A-Za-zÁÉÍÓÚÑáéíóúñ &.'-]{1,50})/i
  );

  if (matchEn) {
    const candidato = matchEn[1]
      .split(/\s+(?:por|con|para|pago|pagando)\s+/i)[0]
      .replace(/\b\d[\d.,]*(?:\s*(?:mil|k))?\b/gi, "")
      .trim();
    if (candidato) {
      const generico = normalizar(candidato);
      if (!["internet", "online", "en linea", "en línea", "web"].includes(generico)) {
        return candidato;
      }
    }
  }

  return null;
}

function comercioParaSegmento(segmento, segmentos, comercios) {
  if (!comercios.length) return null;

  if (comercios.length === 1) {
    const comercio = comercios[0];
    const primeraPos = segmentos[0]?.inicioMonto ?? 0;
    const ultimaPos = segmentos[segmentos.length - 1]?.finMonto ?? textoLongitud;

    // Antes del primer monto o después del último: comercio común.
    if (comercio.inicio < primeraPos || comercio.inicio > ultimaPos) {
      return comercio.nombre;
    }

    // Si aparece entre dos productos, solo pertenece al producto más cercano.
    const masCercano = segmentos.reduce((mejor, candidato) => {
      const d = Math.abs(comercio.inicio - candidato.inicioMonto);
      if (!mejor || d < mejor.distancia) return { segmento: candidato, distancia: d };
      return mejor;
    }, null);

    return masCercano?.segmento === segmento ? comercio.nombre : null;
  }

  return elementoMasCercanoAlMonto(segmento, comercios);
}


function elementoMasCercanoAlMonto(segmento, elementos) {
  let mejor = null;
  let mejorDistancia = Infinity;

  for (const elemento of elementos) {
    const distancia = Math.abs(elemento.inicio - segmento.inicioMonto);
    if (distancia < mejorDistancia) {
      mejorDistancia = distancia;
      mejor = elemento;
    }
  }

  return mejor?.nombre || null;
}


// ============================================================
// FORMA DE PAGO POR POSICIÓN
// ============================================================

function extraerPagosConPosicion(texto) {
  const normal = normalizar(texto);
  const pagos = [];
  const patrones = [
    { re: /\b(?:tc|tarjeta de credito|tarjeta credito)\b/g, nombre: "Tarjeta de crédito" },
    { re: /\b(?:tarjeta de debito|tarjeta debito|debito)\b/g, nombre: "Tarjeta débito" },
    { re: /\befectivo\b/g, nombre: "Efectivo" },
    { re: /\btransferencia\b/g, nombre: "Transferencia" }
  ];

  for (const p of patrones) {
    let m;
    while ((m = p.re.exec(normal)) !== null) {
      pagos.push({ nombre: p.nombre, inicio: m.index, fin: m.index + m[0].length });
    }
  }

  return pagos.sort((a, b) => a.inicio - b.inicio);
}

function extraerFormaPago(texto) {
  const pagos = extraerPagosConPosicion(texto);
  return pagos.length ? pagos[0].nombre : null;
}

function pagoParaSegmento(segmento, segmentos, pagos, index) {
  if (!pagos.length) return null;

  if (pagos.length === 1) {
    const pago = pagos[0];
    const primeraPos = segmentos[0]?.inicioMonto ?? 0;
    const ultimaPos = segmentos[segmentos.length - 1]?.finMonto ?? textoLongitud;

    if (pago.inicio < primeraPos || pago.inicio > ultimaPos) {
      return pago.nombre;
    }

    const masCercano = segmentos.reduce((mejor, candidato) => {
      const d = Math.abs(pago.inicio - candidato.inicioMonto);
      if (!mejor || d < mejor.distancia) return { segmento: candidato, distancia: d };
      return mejor;
    }, null);

    return masCercano?.segmento === segmento ? pago.nombre : null;
  }

  return elementoMasCercanoAlMonto(segmento, pagos);
}


// ============================================================
// PERSONA POR POSICIÓN
// ============================================================

function extraerPersonasConPosicion(texto) {
  const normal = normalizar(texto);
  const personas = [];
  const re = /\b(?:para|con)\s+(diana)\b|\b(diana)\s+(?:compro|compró)\b/gi;
  let m;

  while ((m = re.exec(normal)) !== null) {
    personas.push({ nombre: "Diana", inicio: m.index, fin: re.lastIndex });
  }

  return personas;
}

function extraerPersona(textoOriginal, textoNormalizado) {
  if (/\bpara diana\b/i.test(textoOriginal)) return "Diana";
  if (/\bdiana\s+(?:compro|compró)\b/i.test(textoNormalizado)) return "Diana";
  if (/\bcon diana\b/i.test(textoOriginal)) return "Diana";
  if (/\bmi esposa\b/i.test(textoNormalizado)) return "Diana";
  return null;
}

function extraerPersonaGlobal(textoOriginal, textoNormalizado) {
  if (/\bdiana\s+(?:compro|compró)\b/i.test(textoNormalizado)) return "Diana";
  if (/\bcon diana\b/i.test(textoOriginal)) return "Diana";
  if (/\bmi esposa\b/i.test(textoNormalizado)) return "Diana";
  return null;
}


function personaParaSegmento(segmento, segmentos, personas) {
  const texto = normalizar(segmento.texto);
  if (/\bdiana\b/i.test(texto) && (/\bpara diana\b/i.test(texto) || /\bdiana\b/i.test(texto))) {
    return "Diana";
  }

  const conjunto = normalizar(segmentos.map(s => s.texto).join(" "));
  if (/\bdiana\s+(?:compro|compró)\b/i.test(conjunto) || /\bcon diana\b/i.test(conjunto)) {
    return "Diana";
  }

  return null;
}


// ============================================================
// FECHAS
// ============================================================

function obtenerFecha(texto) {
  // 1) Fecha explícita: "el 1 de agosto", "1 de agosto de 2026", etc.
  const fechaExplicita = extraerFechaExplicita(texto);
  if (fechaExplicita) return fechaExplicita;

  // 2) Fechas relativas. "Antes de ayer" debe evaluarse antes que "ayer".
  if (contieneFraseExacta(texto, "antes de ayer")) return fechaColombia(-2);
  if (contienePalabraExacta(texto, "antier")) return fechaColombia(-2);
  if (contienePalabraExacta(texto, "hoy")) return fechaColombia(0);
  if (contienePalabraExacta(texto, "ayer") || contienePalabraExacta(texto, "anoche")) {
    return fechaColombia(-1);
  }

  // 3) Día de la semana: siempre toma la ocurrencia anterior.
  //    Si hoy es sábado y dices "el sábado", significa el sábado pasado.
  const dias = {
    domingo: 0,
    lunes: 1,
    martes: 2,
    miercoles: 3,
    jueves: 4,
    viernes: 5,
    sabado: 6
  };

  for (const [nombre, dia] of Object.entries(dias)) {
    if (contienePalabraExacta(texto, nombre)) return fechaDiaSemana(dia);
  }

  return fechaColombia(0);
}

function extraerFechaExplicita(texto) {
  const meses = {
    enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
    julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10,
    noviembre: 11, diciembre: 12
  };

  // "el 1 de agosto", "1 de agosto de 2026", "1 de agosto del 2026".
  const textual = texto.match(
    /\b(?:el\s+)?(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+(?:de|del)\s+(\d{4}))?\b/i
  );

  if (textual) {
    const dia = Number(textual[1]);
    const mes = meses[normalizar(textual[2])];
    const colombia = obtenerAhoraColombia();
    const anio = textual[3] ? Number(textual[3]) : colombia.getFullYear();

    if (esFechaValida(anio, mes, dia)) {
      return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    }
  }

  // También aceptamos formatos numéricos habituales: 1/8/2026, 01-08-2026, 1/8.
  const numerica = texto.match(/\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{4}))?\b/);
  if (numerica) {
    const dia = Number(numerica[1]);
    const mes = Number(numerica[2]);
    const anio = numerica[3] ? Number(numerica[3]) : obtenerAhoraColombia().getFullYear();

    if (mes >= 1 && mes <= 12 && esFechaValida(anio, mes, dia)) {
      return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    }
  }

  return null;
}

function obtenerAhoraColombia() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
}

function esFechaValida(anio, mes, dia) {
  if (!Number.isInteger(anio) || !Number.isInteger(mes) || !Number.isInteger(dia)) return false;
  if (mes < 1 || mes > 12 || dia < 1) return false;
  const diasMes = new Date(anio, mes, 0).getDate();
  return dia <= diasMes;
}

function contieneFraseExacta(texto, frase) {
  const f = normalizar(frase);
  const regex = new RegExp(`(^|[^a-z0-9áéíóúñ])${escaparRegex(f)}($|[^a-z0-9áéíóúñ])`, "i");
  return regex.test(normalizar(texto));
}

function detectarRangosDeFecha(texto) {
  const rangos = [];
  const t = normalizar(texto);
  const meses = "enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre";

  const textual = new RegExp(`\\b(?:el\\s+)?\\d{1,2}\\s+de\\s+(?:${meses})(?:\\s+(?:de|del)\\s+\\d{4})?\\b`, "gi");
  let match;
  while ((match = textual.exec(t)) !== null) {
    rangos.push([match.index, textual.lastIndex]);
  }

  const numerica = /\b\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{4})?\b/g;
  while ((match = numerica.exec(t)) !== null) {
    rangos.push([match.index, numerica.lastIndex]);
  }

  return rangos;
}

function fechaDiaSemana(diaObjetivo) {
  const ahora = new Date();
  const colombia = new Date(ahora.toLocaleString("en-US", { timeZone: "America/Bogota" }));
  const actual = colombia.getDay();
  let diferencia = actual - diaObjetivo;

  // "el sábado" significa el sábado anterior si hoy también es sábado.
  if (diferencia <= 0) diferencia += 7;

  colombia.setDate(colombia.getDate() - diferencia);

  const year = colombia.getFullYear();
  const month = String(colombia.getMonth() + 1).padStart(2, "0");
  const day = String(colombia.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fechaColombia(diasOffset = 0) {
  const ahora = new Date();
  const fecha = new Date(ahora.toLocaleString("en-US", { timeZone: "America/Bogota" }));
  fecha.setDate(fecha.getDate() + diasOffset);

  const year = fecha.getFullYear();
  const month = String(fecha.getMonth() + 1).padStart(2, "0");
  const day = String(fecha.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}


// ============================================================
// COMERCIOS - V13
// La periodicidad no forma parte del motor de V13.
// ============================================================

// ============================================================
// CATEGORÍAS - COINCIDENCIAS SEGURAS
// ============================================================

function clasificarCategoria(texto) {
  // REGLAS EXPLÍCITAS DE COMERCIOS/SERVICIOS
  // Estas reglas tienen prioridad porque el comercio puede revelar la
  // intención del gasto incluso cuando la descripción bancaria es ambigua.
  // Se ejecutan antes de "mercado", para evitar que "MercadoPago/MERCADOLI"
  // termine erróneamente en Hogar.

  // RAPPI -> Pedidos Rappi y otros
  if (contiene(texto, ["rappi", "rapi", "rappy"])) {
    return { categoria: "Restaurantes y Rappi", subcategoria: "Pedidos Rappi y otros", confianza: "alta" };
  }

  // MERCADOLIBRE -> Compras con TC (Amazon, Mercadolibre).
  // El banco puede mostrar variantes como MERCADOLI, MERCADOLIBRE,
  // MERCADO LIBRE o PagoMERCADOLI.
  if (contiene(texto, ["mercadolibre", "mercado libre", "mercadoli", "mercadolib" ])) {
    return { categoria: "Pagos varios/Oscio", subcategoria: "Compras con Tc (Amazon, Mercadolibre)", confianza: "alta" };
  }

  // NETFLIX -> Netflix TC, incluso con OCR pegado: DLONetflixcom, etc.
  if (contiene(texto, ["netflix"])) {
    return { categoria: "Cuotas/suscripciones", subcategoria: "Netflix TC", confianza: "alta" };
  }

  // HOGAR
  if (
    (
      contienePalabraExacta(texto, "mercado") ||
      contienePalabraExacta(texto, "pan") ||
      contienePalabraExacta(texto, "arepas") ||
      contienePalabraExacta(texto, "arepa") ||
      contienePalabraExacta(texto, "leche") ||
      contienePalabraExacta(texto, "huevos") ||
      contienePalabraExacta(texto, "huevo") ||
      contienePalabraExacta(texto, "jumbo") ||
      contienePalabraExacta(texto, "mercaz")
    ) &&
    !contiene(texto, ["restaurante", "salida a comer"])
  ) {
    return { categoria: "Hogar", subcategoria: "Mercado jumbo o mercaz", confianza: "alta" };
  }

  if (contiene(texto, ["rapitienda", "la roca", "remesa"])) {
    return { categoria: "Hogar", subcategoria: "Remesas Rapitienda la roca", confianza: "alta" };
  }

  if (contiene(texto, ["administracion", "bosques de chipichape"])) {
    return { categoria: "Hogar", subcategoria: "Administración Bosques de Chipichape", confianza: "alta" };
  }

  if (contiene(texto, ["emcali", "servicio publico", "servicios publicos", "energia", "agua"]) || contienePalabraExacta(texto, "gas")) {
    return { categoria: "Hogar", subcategoria: "Servicios públicos (Emcali, gas)", confianza: "alta" };
  }

  if (contiene(texto, ["claro", "telmex"])) {
    return { categoria: "Hogar", subcategoria: "Claro/ telmex", confianza: "alta" };
  }

  // ASEO ANA
  // Regla base para las formas naturales más directas.
  // Los casos más variados (por ejemplo, "aseo de apartamento")
  // se resuelven mediante el aprendizaje confirmado en D1.
  if (
    contienePalabraExacta(texto, "aseo") &&
    contienePalabraExacta(texto, "ana")
  ) {
    return { categoria: "Hogar", subcategoria: "Ana aseo 2 veces al mes", confianza: "alta" };
  }

  if (contiene(texto, ["restaurante", "restaurantes", "comer", "cena", "almuerzo", "desayuno", "salir a comer", "hamburguesa", "hamburguesas", "helado", "ventolini"])) {
    return { categoria: "Restaurantes y Rappi", subcategoria: "Salidas a comer por fuera restaurantes", confianza: "alta" };
  }

  // CUOTAS / SUSCRIPCIONES
  // Primero resolvemos servicios específicos del catálogo.
  // Así, "suscripción Spotify" no cae en "Otras suscripciones".
  if (contiene(texto, ["spotify"])) return { categoria: "Cuotas/suscripciones", subcategoria: "Spotify", confianza: "alta" };
  if (contiene(texto, ["icloud"])) return { categoria: "Cuotas/suscripciones", subcategoria: "Apple icloud", confianza: "alta" };
  if (contiene(texto, ["chatgpt", "chat gpt"])) return { categoria: "Cuotas/suscripciones", subcategoria: "Chat Gpt plus", confianza: "alta" };
  if (contiene(texto, ["suscripcion", "suscripciones", "paramount", "disney plus", "disney+", "hbo max", "prime video"])) {
    return { categoria: "Cuotas/suscripciones", subcategoria: "Otras suscripciones", confianza: "alta" };
  }

  // PERSONAL
  if (contiene(texto, ["peluqueria", "pelo diana", "tratamiento pelo", "corte de pelo", "cortarme el pelo", "corte pelo", "shampoo", "champu"])) {
    return { categoria: "Personal", subcategoria: "Peluquería u otros / tratamiento pelo Diana", confianza: "alta" };
  }

  if (contiene(texto, ["uñas", "unas"])) {
    return { categoria: "Personal", subcategoria: "Arreglo uñas Diana y Gerardo (Ana) 2 x mes", confianza: "alta" };
  }

  if (contiene(texto, ["gym", "bodytech", "gaachinte"])) {
    return { categoria: "Personal", subcategoria: "Gym Gaachinte Bodytech anual", confianza: "alta" };
  }

  if (contiene(texto, ["drogueria", "pastas", "vitaminas", "medicamento", "medicamentos"])) {
    return { categoria: "Personal", subcategoria: "Droguería o pastas vitaminas u otros", confianza: "alta" };
  }

  if (contiene(texto, ["colmedica", "prepagada", "salud prepagada"])) {
    return { categoria: "Personal", subcategoria: "Salud prepagada Diana-Colmedica 25 c/mes", confianza: "alta" };
  }

  if (contiene(texto, ["examen medico", "examenes medicos", "examenes", "medico"])) {
    return { categoria: "Personal", subcategoria: "Exámenes médicos / Colmedica", confianza: "alta" };
  }

  if (contiene(texto, ["ropa", "vestido", "camisa", "camisas", "pantalon", "pantalones", "jean", "jeans", "zapatos", "tenis", "tennis", "zapatillas", "chaqueta", "saco", "blusa", "sandalias", "botas"])) {
    return { categoria: "Personal", subcategoria: "Ropa y vestuario", confianza: "alta" };
  }

  // GASTOS PERLA
  if (contiene(texto, ["peluqueria perla"])) return { categoria: "Gastos perla", subcategoria: "Peluqueria", confianza: "alta" };
  if (contiene(texto, ["veterinaria", "veterinario"])) return { categoria: "Gastos perla", subcategoria: "Veterinaria", confianza: "alta" };
  if (contiene(texto, ["perla", "comida perla", "alimentacion perla", "medicina perla"])) return { categoria: "Gastos perla", subcategoria: "Medicina y alimentación perla", confianza: "alta" };

  // PAGOS VARIOS / OCIO
  if (contiene(texto, ["lavada carro", "lavado carro", "lavar carro"])) {
    return { categoria: "Pagos varios/Oscio", subcategoria: "Lavada de carro", confianza: "alta" };
  }

  return { categoria: "Pagos varios/Oscio", subcategoria: "Otros varios/ocio", confianza: "media" };
}


// ============================================================
// LIMPIEZA Y UTILIDADES
// ============================================================

function limpiarConcepto(texto) {
  let t = normalizar(texto);

  t = t
    .replace(/\b(antes\s+de\s+ayer|hoy|ayer|antier|anoche)\b/g, "")
    .replace(/\b(?:el\s+)?\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+(?:de|del)\s+\d{4})?\b/g, "")
    .replace(/\b\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{4})?\b/g, "")
    .replace(/\b(?:el\s+lunes|el\s+martes|el\s+miercoles|el\s+jueves|el\s+viernes|el\s+sabado|el\s+domingo)\b/g, "")
    .replace(/\b(?:pague|pague|compre|compramos|compro|gasto|gaste|pago|pedido|pidio|pidio)\b/g, "")
    .replace(/\b\d[\d.,]*(?:\s*(?:mil|k))?\b/g, "")
    .replace(/\b(tc|tarjeta de credito|tarjeta credito|tarjeta de debito|tarjeta debito|debito|efectivo|transferencia)\b/g, "")
    .replace(/\b(?:en|por|con|para|de)\s+(?:mercadolibre|mercado libre|amazon|rappi turbo|rappi|farmatodo|ventolini|carulla|shein|pandora|velez|lacoste|avianca|unicentro|jumbo|el corral|corral)\b/g, "")
    .replace(/\b(?:diana)\b/g, "")
    .replace(/\b(?:mas|más)\b/g, "")
    .replace(/\bpropina\b/g, "")
    .replace(/\\b(?:un|una|unos|unas)\\b/g, "")
    .replace(/\s+(?:por|para|con|en|de|y|e)\s*$/i, "")
    .replace(/^\s*(?:y|e|despues|luego)\s+/, "")
    .replace(/\s+(?:por|para|con|en|de|y|e)\s*$/i, "")
    .replace(/^[,;:.\-]+\s*/, "")
    .replace(/\s+/g, " ")
    .trim();

  return t || texto.trim();
}

function limpiarTexto(texto) {
  return (texto || "").replace(/\s+/g, " ").trim();
}

function esCoincidenciaValida(texto, patron, inicio) {
  if (["mercado libre"].includes(patron)) return true;
  if (patron.includes(" ")) return true;
  const antes = inicio === 0 ? "" : texto[inicio - 1];
  const despues = texto[inicio + patron.length] || "";
  return !/[a-z0-9áéíóúñ]/i.test(antes) && !/[a-z0-9áéíóúñ]/i.test(despues);
}

function contiene(texto, palabras) {
  return palabras.some(palabra => {
    const p = normalizar(palabra);
    if (p.includes(" ")) return texto.includes(p);
    return contienePalabraExacta(texto, p);
  });
}

function contienePalabraExacta(texto, palabra) {
  const p = normalizar(palabra);
  const regex = new RegExp(`(^|[^a-z0-9áéíóúñ])${escaparRegex(p)}($|[^a-z0-9áéíóúñ])`, "i");
  return regex.test(texto);
}

function escaparRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizar(texto) {
  return (texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// ============================================================
// PROCESAR WHATSAPP / META
// ============================================================

async function procesarWhatsApp(
  env,
  body
) {
  const entry =
    body?.entry?.[0];

  const change =
    entry?.changes?.[0];

  const value =
    change?.value;

  const message =
    value?.messages?.[0];

  if (!message) {
    console.log(
      "Meta webhook recibido sin mensaje"
    );

    return new Response(
      "EVENT_RECEIVED",
      { status: 200 }
    );
  }

  const from =
    message?.from;

  const messageType =
    message?.type;

  let text = "";

  if (
    messageType === "text"
  ) {
    text =
      message?.text?.body || "";
  }

  console.log(
    "WHATSAPP MENSAJE"
  );

  console.log(
    JSON.stringify({
      from,
      messageType,
      text
    })
  );

  const resultado =
    interpretarGasto(text);

  console.log(
    "RESULTADO INTERPRETACIÓN WHATSAPP"
  );

  console.log(
    JSON.stringify(resultado)
  );

  return new Response(
    "EVENT_RECEIVED",
    { status: 200 }
  );
}