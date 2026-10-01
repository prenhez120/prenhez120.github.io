/* Prenhez 120 — configuração, sessão e acesso aos dados (cadastro e simulações) */

/* ===================== CONFIGURAÇÃO =====================
 * ENDPOINT: cole a URL do App da Web do Google Apps Script (termina em /exec).
 * Vazio = modo de demonstração: cadastros e simulações ficam só neste navegador.
 * CAMBIO_PADRAO: usado só se a planilha não responder. O câmbio oficial fica
 * na aba "Config" da planilha (Cambios Chaco · sucursal Pedro Juan Caballero).
 */
var P120 = {
  ENDPOINT: "",
  CAMBIO_PADRAO: {
    brl_compra: 1120, brl_venda: 1170, usd_compra: 5780, usd_venda: 5850,
    data_cotacao: "01/10/2026", regra: "Cotação do dia",
    fonte: "Cambios Chaco · sucursal Pedro Juan Caballero"
  }
};

/* ---------- armazenamento local seguro ---------- */
var LS = {
  get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
};
var Session = {
  get: function () { return LS.get("p120_sessao", null); },
  set: function (s) { LS.set("p120_sessao", s); },
  clear: function () { LS.del("p120_sessao"); }
};

/* ---------- utilitários ---------- */
var U = {
  normDoc: function (s) { return String(s || "").replace(/[^0-9A-Za-z]/g, "").toUpperCase(); },
  normEmail: function (s) { return String(s || "").trim().toLowerCase(); },
  digits: function (s) { var d = String(s || "").replace(/\D/g, ""); return d ? Number(d) : 0; },
  nf: function (v, d) { d = d || 0; return Number(v).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }); },
  uid: function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); },
  esc: function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); },
  toast: function (msg) {
    var t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); t.textContent = msg;
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2600);
  },
  dataHora: function (iso) {
    var d = new Date(iso); if (isNaN(d)) return "";
    return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
};

/* ---------- API: planilha (produção) ou navegador (demonstração) ---------- */
function api(action, data) {
  data = data || {};
  if (!P120.ENDPOINT) return Promise.resolve().then(function () { return LocalApi(action, data); });
  var payload = Object.assign({ action: action }, data);
  return fetch(P120.ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  }).then(function (r) {
    if (!r.ok) throw new Error("Servidor indisponível (" + r.status + "). Tente de novo em instantes.");
    return r.json();
  }).then(function (j) {
    if (!j.ok) throw new Error(j.error || "Não foi possível concluir. Tente de novo.");
    return j;
  });
}
api.isDemo = function () { return !P120.ENDPOINT; };

/* Simula o Apps Script no navegador para testar o fluxo sem planilha. */
function LocalApi(action, d) {
  var db = LS.get("p120_demo_db", { cadastros: [], simulacoes: [] });
  var save = function () { LS.set("p120_demo_db", db); };
  var now = new Date().toISOString();
  var auth = function () {
    var c = db.cadastros.filter(function (x) { return x.id === d.id && x.token === d.token; })[0];
    if (!c) throw new Error("Sessão expirada. Entre de novo com seu e-mail e documento.");
    return c;
  };
  var pub = function (c) { return { ok: true, id: c.id, token: c.token, nome: c.nome, email: c.email, moeda: c.moeda, valor: c.valor }; };

  if (action === "config") return { ok: true, cambio: P120.CAMBIO_PADRAO };

  if (action === "cadastro") {
    var f = d.dados || {};
    var email = U.normEmail(f.email), doc = U.normDoc(f.documento);
    var c = db.cadastros.filter(function (x) { return x.email === email && x.doc_norm === doc; })[0];
    if (c) { Object.assign(c, f, { email: email, doc_norm: doc, atualizado_em: now }); }
    else {
      c = Object.assign({}, f, { id: U.uid(), token: U.uid() + U.uid(), email: email, doc_norm: doc, criado_em: now, atualizado_em: now, etapa: "Cadastrado" });
      db.cadastros.push(c);
    }
    save(); return pub(c);
  }
  if (action === "login") {
    var em = U.normEmail(d.email), dc = U.normDoc(d.documento);
    var found = db.cadastros.filter(function (x) { return x.email === em && x.doc_norm === dc; })[0];
    if (!found) throw new Error("Não encontramos um cadastro com esse e-mail e documento.");
    return pub(found);
  }
  if (action === "salvarSimulacao") {
    var cad = auth(); var s = null;
    if (d.simId) s = db.simulacoes.filter(function (x) { return x.simId === d.simId && x.investidorId === cad.id; })[0];
    if (s) Object.assign(s, { titulo: d.titulo, params: d.params, resumo: d.resumo, atualizadoEm: now });
    else { s = { simId: U.uid(), investidorId: cad.id, titulo: d.titulo, params: d.params, resumo: d.resumo, criadoEm: now, atualizadoEm: now }; db.simulacoes.push(s); }
    if (cad.etapa === "Cadastrado") cad.etapa = "Simulou";
    save(); return { ok: true, simId: s.simId, atualizadoEm: now };
  }
  if (action === "listarSimulacoes") {
    var me = auth();
    var list = db.simulacoes.filter(function (x) { return x.investidorId === me.id; })
      .sort(function (a, b) { return a.atualizadoEm < b.atualizadoEm ? 1 : -1; });
    return { ok: true, simulacoes: list };
  }
  if (action === "excluirSimulacao") {
    var u = auth();
    db.simulacoes = db.simulacoes.filter(function (x) { return !(x.simId === d.simId && x.investidorId === u.id); });
    save(); return { ok: true };
  }
  throw new Error("Ação desconhecida.");
}
