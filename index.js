
const SUPABASE_URL = "https://fraawlukojkczqsoxedn.supabase.co";
const SUPABASE_KEY = "sb_publishable_Fgq6sJCgyijPuTtmmaPNRw_wLQ9lc8U";

const banco = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const FUSO = "America/Sao_Paulo";
const LIMITE_LEITURAS = 50;
const INTERVALO = 10000;
const TEMPO_ALERTA = 300000;
const TEMPO_LEITURA = 120000;

const sensores = [
    {
        id: "temperatura",
        titulo: "Temperatura",
        icone: "img/term.svg",
        unidade: "°C",
        cor: "#FF8A00"
    },
    {
        id: "umidade",
        titulo: "Umidade",
        icone: "img/umidade.svg",
        unidade: "%",
        cor: "#29B6F6"
    },
    {
        id: "pressao",
        titulo: "Pressão",
        icone: "img/pressao.svg",
        unidade: "hPa",
        cor: "#7E57C2"
    },
    {
        id: "qualidade_ar",
        titulo: "Qualidade do Ar",
        icone: "img/qualidade_ar.svg",
        unidade: "",
        cor: "#43A047"
    },
    {
        id: "luminosidade",
        titulo: "Luminosidade",
        icone: "img/luminosidade.svg",
        unidade: "",
        cor: "#FDD835"
    }
];

const camposEstatisticos = [
    {
        id: "temperatura",
        nome: "Temperatura",
        unidade: "°C",
        tolerancia: 0.5
    },
    {
        id: "umidade",
        nome: "Umidade",
        unidade: "%",
        tolerancia: 2
    },
    {
        id: "pressao",
        nome: "Pressão",
        unidade: "hPa",
        tolerancia: 1
    },
    {
        id: "qualidade_ar",
        nome: "Qualidade do ar",
        unidade: "ADC",
        tolerancia: 20
    }
];

let graficoTemperatura = null;
let graficoUmidade = null;
let mapa = null;
let marcadorEstacao = null;

let ultimaLeitura = null;
let carregandoDados = false;
let carregandoAlertas = false;
let carregandoMaisAlertas = false;

let alertas = [];
let mostrarAntigos = false;
let existemMaisAlertas = false;
let cursorAlertas = null;

const atipicosAtuais = new Map();
const atipicosJaVistos = new Map();

function obterElemento(id) {
    return document.getElementById(id);
}

function definirTexto(id, texto) {
    const elemento = obterElemento(id);

    if (elemento) {
        elemento.textContent = texto;
    }
}

function numeroValido(valor) {
    return valor !== null &&
        valor !== undefined &&
        valor !== "" &&
        Number.isFinite(Number(valor));
}

function formatarNumero(valor, casas = 2) {
    if (!numeroValido(valor)) {
        return "--";
    }

    return Number(valor).toLocaleString("pt-BR", {
        minimumFractionDigits: casas,
        maximumFractionDigits: casas
    });
}

function lerDataUTC(valor) {
    if (!valor) {
        return null;
    }

    const texto = String(valor).trim().replace(" ", "T");

    const possuiFuso = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(texto);

    const data = new Date(
        possuiFuso ? texto : `${texto}Z`
    );

    return Number.isNaN(data.getTime()) ? null : data;
}

function formatarDataHora(valor) {
    const data = lerDataUTC(valor);

    if (!data) {
        return "--";
    }

    return new Intl.DateTimeFormat("pt-BR", {
        timeZone: FUSO,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
    }).format(data);
}

function formatarHora(valor) {
    const data = lerDataUTC(valor);

    if (!data) {
        return "--";
    }

    return new Intl.DateTimeFormat("pt-BR", {
        timeZone: FUSO,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
    }).format(data);
}

function classificarQualidadeAr(valor) {
    if (!numeroValido(valor)) {
        return "Indisponível";
    }

    const adc = Number(valor);

    if (adc < 0 || adc > 4095) {
        return "Inválido";
    }

    if (adc < 800) {
        return "Boa";
    }

    if (adc < 1500) {
        return "Moderada";
    }

    if (adc < 2500) {
        return "Ruim";
    }

    return "Muito Ruim";
}

function criarCards() {
    const container = obterElemento("cards");

    if (!container) {
        return;
    }

    container.innerHTML = "";

    sensores.forEach(sensor => {
        const card = document.createElement("div");
        card.className = "card";
        card.style.setProperty("--cor-sensor", sensor.cor);

        const topo = document.createElement("div");
        topo.className = "card-topo";

        const icone = document.createElement("img");
        icone.src = sensor.icone;
        icone.alt = "";

        const titulo = document.createElement("h3");
        titulo.textContent = sensor.titulo;

        topo.appendChild(icone);
        topo.appendChild(titulo);

        const valor = document.createElement("p");
        valor.id = sensor.id;
        valor.textContent = "--";

        card.appendChild(topo);
        card.appendChild(valor);

        container.appendChild(card);
    });
}

function atualizarCards(leitura) {
    sensores.forEach(sensor => {
        const elemento = obterElemento(sensor.id);

        if (!elemento) {
            return;
        }

        if (!leitura) {
            elemento.textContent = "--";
            return;
        }

        const valor = leitura[sensor.id];

        if (sensor.id === "qualidade_ar") {
            elemento.textContent = classificarQualidadeAr(valor);
            return;
        }

        if (sensor.id === "luminosidade") {
            if (!numeroValido(valor)) {
                elemento.textContent = "--";
            } else if (Number(valor) === 0) {
                elemento.textContent = "Claro";
            } else if (Number(valor) === 1) {
                elemento.textContent = "Escuro";
            } else {
                elemento.textContent = "Indisponível";
            }

            return;
        }

        elemento.textContent = numeroValido(valor)
            ? `${formatarNumero(valor)} ${sensor.unidade}`
            : "--";
    });
}

function criarGrafico(id, titulo, cor, minimo, maximo, intervalo) {
    const canvas = obterElemento(id);

    if (!canvas || !window.Chart) {
        return null;
    }

    return new Chart(canvas, {
        type: "line",
        data: {
            labels: [],
            datasets: [{
                label: titulo,
                data: [],
                borderColor: cor,
                backgroundColor: cor + "22",
                borderWidth: 2,
                fill: true,
                tension: 0.25,
                pointRadius: 2,
                pointHoverRadius: 5,
                spanGaps: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    ticks: {
                        maxTicksLimit: 8
                    }
                },
                y: {
                    min: minimo,
                    max: maximo,
                    ticks: {
                        stepSize: intervalo
                    }
                }
            }
        }
    });
}

function iniciarGraficos() {
    graficoTemperatura = criarGrafico(
        "graficoTemp",
        "Temperatura (°C)",
        "#FF8A00",
        0,
        50,
        5
    );

    graficoUmidade = criarGrafico(
        "graficoUmid",
        "Umidade (%)",
        "#29B6F6",
        0,
        100,
        10
    );
}

function atualizarGraficos(historico) {
    const dados = [...historico].reverse();

    const horarios = dados.map(item =>
        formatarHora(item.data_hora)
    );

    const configuracoes = [
        [graficoTemperatura, "temperatura"],
        [graficoUmidade, "umidade"]
    ];

    configuracoes.forEach(([grafico, campo]) => {
        if (!grafico) {
            return;
        }

        grafico.data.labels = horarios;

        grafico.data.datasets[0].data = dados.map(item =>
            numeroValido(item[campo])
                ? Number(item[campo])
                : null
        );

        grafico.update("none");
    });
}

function calcularMediana(valores) {
    if (!valores.length) {
        return null;
    }

    const ordenados = [...valores].sort((a, b) => a - b);
    const meio = Math.floor(ordenados.length / 2);

    return ordenados.length % 2
        ? ordenados[meio]
        : (ordenados[meio - 1] + ordenados[meio]) / 2;
}

function calcularEstatisticas(valores) {
    if (!valores.length) {
        return null;
    }

    const media = valores.reduce(
        (soma, valor) => soma + valor,
        0
    ) / valores.length;

    const mediana = calcularMediana(valores);

    const mad = calcularMediana(
        valores.map(valor => Math.abs(valor - mediana))
    );

    const variancia = valores.reduce(
        (soma, valor) => soma + (valor - media) ** 2,
        0
    ) / valores.length;

    return {
        amostras: valores.length,
        media,
        mediana,
        minimo: Math.min(...valores),
        maximo: Math.max(...valores),
        desvio: Math.sqrt(variancia),
        mad
    };
}

function atualizarEstatisticas(historico) {
    const container = obterElemento("estatisticas");

    if (!container) {
        return;
    }

    container.innerHTML = "";

    camposEstatisticos.forEach(campo => {
        const valores = historico
            .map(item => item[campo.id])
            .filter(numeroValido)
            .map(Number);

        const dados = calcularEstatisticas(valores);

        if (!dados) {
            return;
        }

        const bloco = document.createElement("div");
        bloco.className = "estatistica-item";

        const titulo = document.createElement("h3");
        titulo.textContent = campo.nome;

        bloco.appendChild(titulo);

        const linhas = [
            ["Amostras", dados.amostras],
            ["Média", formatarNumero(dados.media)],
            ["Mediana", formatarNumero(dados.mediana)],
            ["Mínimo", formatarNumero(dados.minimo)],
            ["Máximo", formatarNumero(dados.maximo)],
            ["Desvio padrão", formatarNumero(dados.desvio)],
            ["MAD", formatarNumero(dados.mad)]
        ];

        linhas.forEach(([nome, valor]) => {
            const linha = document.createElement("p");
            const destaque = document.createElement("strong");

            destaque.textContent = `${nome}: `;

            linha.appendChild(destaque);
            linha.appendChild(
                document.createTextNode(String(valor))
            );

            bloco.appendChild(linha);
        });

        container.appendChild(bloco);
    });
}

function limparAtipicosExpirados() {
    const agora = Date.now();

    atipicosAtuais.forEach((item, chave) => {
        if (agora - item.detectadoEm >= TEMPO_ALERTA) {
            atipicosAtuais.delete(chave);
        }
    });
}

function atualizarAtipicos(historico) {
    limparAtipicosExpirados();

    camposEstatisticos.forEach(campo => {
        const leituras = historico.filter(item =>
            numeroValido(item[campo.id])
        );

        const valores = leituras.map(item =>
            Number(item[campo.id])
        );

        if (valores.length < 5) {
            return;
        }

        const mediana = calcularMediana(valores);

        const mad = calcularMediana(
            valores.map(valor => Math.abs(valor - mediana))
        );

        if (!mad) {
            return;
        }

        const indice = valores.findIndex(valor => {
            const diferenca = Math.abs(valor - mediana);
            const pontuacao = 0.6745 * diferenca / mad;

            return diferenca > campo.tolerancia &&
                pontuacao > 3.5;
        });

        if (indice < 0) {
            return;
        }

        const leitura = leituras[indice];
        const instante = lerDataUTC(leitura.data_hora)?.getTime();

        if (instante === undefined || instante === null) {
            return;
        }

        const id = Number(leitura.id_leitura);
        const anterior = atipicosJaVistos.get(campo.id);

        if (
            anterior &&
            (
                instante < anterior.instante ||
                (
                    instante === anterior.instante &&
                    id <= anterior.id
                )
            )
        ) {
            return;
        }

        atipicosJaVistos.set(campo.id, {
            instante,
            id
        });

        if (Math.abs(Date.now() - instante) > TEMPO_ALERTA) {
            return;
        }

        atipicosAtuais.set(campo.id, {
            nome: campo.nome,
            valor: valores[indice],
            unidade: campo.unidade,
            data_hora: leitura.data_hora,
            detectadoEm: Date.now()
        });
    });

    mostrarAtipicos();
}

function mostrarAtipicos() {
    const container = obterElemento("outliers");

    if (!container) {
        return;
    }

    limparAtipicosExpirados();
    container.innerHTML = "";

    if (!atipicosAtuais.size) {
        container.textContent =
            "Nenhum valor atípico recente identificado.";
        return;
    }

    atipicosAtuais.forEach(item => {
        const linha = document.createElement("p");

        linha.textContent =
            `${item.nome}: ${formatarNumero(item.valor)} ` +
            `${item.unidade} em ${formatarDataHora(item.data_hora)} ` +
            "(possível valor atípico)";

        container.appendChild(linha);
    });
}

function ordenarAlertas(a, b) {
    const dataA = lerDataUTC(a.criado_em)?.getTime() || 0;
    const dataB = lerDataUTC(b.criado_em)?.getTime() || 0;

    return dataB - dataA || Number(b.id) - Number(a.id);
}

function mesclarAlertas(novos) {
    const mapaAlertas = new Map(
        alertas.map(item => [String(item.id), item])
    );

    novos.forEach(item => {
        mapaAlertas.set(String(item.id), item);
    });

    alertas = [...mapaAlertas.values()].sort(ordenarAlertas);
}

function atualizarCursorAlertas(novos) {
    if (!novos.length) {
        return;
    }

    const maisAntigo = [...novos].sort(ordenarAlertas).at(-1);

    if (!cursorAlertas ||
        ordenarAlertas(maisAntigo, cursorAlertas) > 0) {
        cursorAlertas = {
            id: maisAntigo.id,
            criado_em: maisAntigo.criado_em
        };
    }
}

function alertaRecente(alerta) {
    const instante = lerDataUTC(alerta.criado_em)?.getTime();

    if (instante === undefined || instante === null) {
        return false;
    }

    const diferenca = Date.now() - instante;

    return diferenca >= 0 && diferenca < TEMPO_ALERTA;
}

function criarBotao(texto, acao) {
    const botao = document.createElement("button");

    botao.type = "button";
    botao.className = "botao-mais-alertas";
    botao.textContent = texto;
    botao.addEventListener("click", acao);

    return botao;
}

function criarAlerta(alerta) {
    const elemento = document.createElement("div");
    elemento.className = "alerta-item";

    const mensagem = document.createElement("p");
    mensagem.textContent =
        alerta.mensagem || "Alerta sem descrição";

    const horario = document.createElement("small");
    horario.textContent = formatarDataHora(alerta.criado_em);

    elemento.appendChild(mensagem);
    elemento.appendChild(horario);

    return elemento;
}

function mostrarAlertas() {
    const container = obterElemento("alertas");

    if (!container) {
        return;
    }

    container.innerHTML = "";

    const recentes = alertas
        .filter(alertaRecente)
        .slice(0, 5);

    const antigos = alertas.filter(
        alerta => !alertaRecente(alerta)
    );

    if (!mostrarAntigos) {
        if (!recentes.length) {
            const mensagem = document.createElement("p");
            mensagem.textContent = "Nenhum alerta recente.";
            container.appendChild(mensagem);
        } else {
            recentes.forEach(alerta => {
                container.appendChild(criarAlerta(alerta));
            });
        }

        container.appendChild(
            criarBotao("Ver alertas anteriores", () => {
                mostrarAntigos = true;
                mostrarAlertas();
            })
        );

        return;
    }

    const titulo = document.createElement("h4");
    titulo.textContent = "Alertas anteriores";
    container.appendChild(titulo);

    [...recentes, ...antigos].forEach(alerta => {
        container.appendChild(criarAlerta(alerta));
    });

    if (existemMaisAlertas) {
        const botaoMais = criarBotao(
            carregandoMaisAlertas
                ? "Carregando..."
                : "Carregar mais alertas",
            carregarMaisAlertas
        );

        botaoMais.disabled = carregandoMaisAlertas;
        container.appendChild(botaoMais);
    }

    container.appendChild(
        criarBotao("Mostrar menos", () => {
            mostrarAntigos = false;
            mostrarAlertas();
        })
    );
}

async function carregarAlertas() {
    if (carregandoAlertas) {
        return;
    }

    carregandoAlertas = true;

    try {
        const { data, error } = await banco
            .from("alertas")
            .select("id, mensagem, criado_em")
            .order("criado_em", { ascending: false })
            .order("id", { ascending: false })
            .limit(50);

        if (error) {
            throw error;
        }

        const novos = data || [];

        mesclarAlertas(novos);
        atualizarCursorAlertas(novos);

        if (novos.length === 50) {
            existemMaisAlertas = true;
        }

        mostrarAlertas();
    } catch (erro) {
        console.error("Erro ao carregar alertas:", erro);
    } finally {
        carregandoAlertas = false;
    }
}

async function carregarMaisAlertas() {
    if (carregandoMaisAlertas || !cursorAlertas) {
        return;
    }

    carregandoMaisAlertas = true;
    mostrarAlertas();

    try {
        const filtro =
            `criado_em.lt.${cursorAlertas.criado_em},` +
            `and(criado_em.eq.${cursorAlertas.criado_em},` +
            `id.lt.${cursorAlertas.id})`;

        const { data, error } = await banco
            .from("alertas")
            .select("id, mensagem, criado_em")
            .or(filtro)
            .order("criado_em", { ascending: false })
            .order("id", { ascending: false })
            .limit(20);

        if (error) {
            throw error;
        }

        const novos = data || [];

        mesclarAlertas(novos);
        atualizarCursorAlertas(novos);

        existemMaisAlertas = novos.length === 20;
    } catch (erro) {
        console.error("Erro ao carregar alertas antigos:", erro);
    } finally {
        carregandoMaisAlertas = false;
        mostrarAlertas();
    }
}

function atualizarStatusLeitura() {
    if (!ultimaLeitura) {
        atualizarCards(null);
        definirTexto("ultimaAtualizacao", "--");
        definirTexto("estadoLeitura", "Sem dados");
        return;
    }

    definirTexto(
        "ultimaAtualizacao",
        formatarDataHora(ultimaLeitura.data_hora)
    );

    const instante = lerDataUTC(
        ultimaLeitura.data_hora
    )?.getTime();

    const atualizada =
        instante !== undefined &&
        instante !== null &&
        Math.abs(Date.now() - instante) <= TEMPO_LEITURA;

    definirTexto(
        "estadoLeitura",
        atualizada
            ? "Leitura atualizada"
            : "Leitura desatualizada"
    );

    atualizarCards(atualizada ? ultimaLeitura : null);
}

async function carregarDados() {
    if (carregandoDados) {
        return;
    }

    carregandoDados = true;

    try {
        const { data, error } = await banco
            .from("leituras")
            .select(
                "id_leitura,temperatura,umidade,pressao," +
                "qualidade_ar,luminosidade,data_hora"
            )
            .order("data_hora", { ascending: false })
            .order("id_leitura", { ascending: false })
            .limit(LIMITE_LEITURAS);

        if (error) {
            throw error;
        }

        const historico = data || [];

        ultimaLeitura = historico[0] || null;

        atualizarStatusLeitura();
        atualizarGraficos(historico);
        atualizarEstatisticas(historico);
        atualizarAtipicos(historico);

        definirTexto(
            "statusConexao",
            "Supabase conectado"
        );
    } catch (erro) {
        console.error("Erro na conexão Supabase:", erro);

        definirTexto(
            "statusConexao",
            "Erro na conexão com Supabase"
        );
    } finally {
        carregandoDados = false;
    }
}

async function carregarEstacao() {
    try {
        const { data, error } = await banco
            .from("estacao")
            .select("id, nome, latitude, longitude, altitude")
            .order("id", { ascending: true })
            .limit(1)
            .maybeSingle();

        if (error) {
            throw error;
        }

        if (!data) {
            return;
        }

        const latitude = Number(data.latitude);
        const longitude = Number(data.longitude);

        if (!Number.isFinite(latitude) ||
            !Number.isFinite(longitude)) {
            return;
        }

        definirTexto(
            "latitude",
            formatarNumero(latitude, 6)
        );

        definirTexto(
            "longitude",
            formatarNumero(longitude, 6)
        );

        definirTexto(
            "altitude",
            numeroValido(data.altitude)
                ? `${formatarNumero(data.altitude)} m`
                : "--"
        );

        if (!window.L || !obterElemento("mapa")) {
            return;
        }

        if (!mapa) {
            mapa = L.map("mapa").setView(
                [latitude, longitude],
                14
            );

            L.tileLayer(
                "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
                {
                    attribution: "&copy; OpenStreetMap contributors",
                    maxZoom: 19
                }
            ).addTo(mapa);

            marcadorEstacao = L.marker(
                [latitude, longitude]
            ).addTo(mapa);
        } else {
            mapa.setView([latitude, longitude], 14);
            marcadorEstacao.setLatLng([
                latitude,
                longitude
            ]);
        }

        marcadorEstacao.bindPopup(
            String(data.nome || "Estação meteorológica")
        );

        setTimeout(() => mapa.invalidateSize(), 200);
    } catch (erro) {
        console.error("Erro ao carregar estação:", erro);
    }
}

function iniciarAtualizacaoAutomatica() {
    setInterval(() => {
        carregarDados();
        carregarAlertas();
        atualizarStatusLeitura();
        mostrarAtipicos();
        mostrarAlertas();
    }, INTERVALO);
}

function iniciarDashboard() {
    criarCards();
    iniciarGraficos();

    carregarDados();
    carregarAlertas();
    carregarEstacao();

    iniciarAtualizacaoAutomatica();
}

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        iniciarDashboard
    );
} else {
    iniciarDashboard();
}
