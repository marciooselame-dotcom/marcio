```javascript
const templates_data = [
  {
    regiao: "Joelho",
    corpo:
      "* Sinais compatíveis com episódio de luxação patelar lateral recente e reduzido.\n" +
      "* Rotura do menisco medial (corno posterior/corpo) com amputação e irregularidade da margem livre.\n" +
      "* Rotura radial completa da raiz posterior do menisco medial associada a extrusão do corpo.\n" +
      "* Rotura em alça de balde do menisco medial/lateral com desvio do componente interno no intercôndilo femoral.\n" +
      "* AlteraÃ§Ã£o degenerativa e ruptura horizontal/vertical do menisco lateral associada a formaÃ§Ã£o cÃ­stica parameniscal.\n" +
      "* Rotura completa/parcial proximal do ligamento cruzado anterior (LCA).\n" +
      "* Sinais de reconstrução do ligamento cruzado anterior com neoligamento íntegro/degenerado.\n" +
      "* Estiramento/rotura parcial do ligamento cruzado posterior (LCP).\n" +
      "* Estiramento do ligamento colateral medial (LCM) e lateral (LCL) com edema periligamentar.\n" +
      "* Edema envolvendo as estruturas capsuloligamentares do canto posterolateral (CPL).\n" +
      "* Condropatia femorotibial e patelofemoral graus II, III ou IV (com exposição óssea subcondral).\n" +
      "* Edema da gordura infrapatelar lateral (impacto local/mecanismo extensor).\n" +
      "* Edema da gordura suprapatelar e pré-femoral por sobrecarga mecânica.\n" +
      "* Edema entre o trato iliotibial e o epicôndilo femoral lateral (atrito local).\n" +
      "* Fratura subcondral/impactada no platô tibial ou côndilos femorais.\n" +
      "* Sequela de fratura de platô tibial lateral com material de osteossíntese.\n" +
      "* Cisto de Baker com sinais de ruptura e extravasamento líquido.\n" +
      "* Derrame articular com espessamento sinovial/sinovite ou componente hemático.\n" +
      "* OssificaÃ§Ã£o junto Ã  tuberosidade anterior da tÃ­bia (sequela de Osgood-Schlatter).\n" +
      "* Patela alta, lateralizada ou com sinais de instabilidade."
  },
  {
    regiao: "Ombro",
    corpo:
      "* Tendinopatia do supraespinhal com rotura transfixante completa ou parcial (face articular/bursal).\n" +
      "* Tendinopatia do infraespinhal e do subescapular com fissuras intrínsecas ou roturas parciais.\n" +
      "* Tendinopatia/tenossinovite do cabo longo do bíceps (fissura longitudinal ou luxação medial).\n" +
      "* Bursite subacromial-subdeltóidea com distensão líquida.\n" +
      "* Artropatia degenerativa/mecânica acromioclavicular com osteófitos e edema subcondral.\n" +
      "* Alteração degenerativa do lábio glenoidal com rotura (segmentos superiores/anteroinferior).\n" +
      "* Sinais de luxação glenoumeral anterior recente (Lesão de Hill-Sachs e Bankart labial/ósseo).\n" +
      "* Rotura circunferencial junto à base do lábio glenoidal associada a cistos paralabrais.\n" +
      "* Artropatia degenerativa glenoumeral com erosões condrais profundas.\n" +
      "* Acrômio curvo (Tipo II) ou plano com esporão subjacente.\n" +
      "* Atrofia adiposa dos ventres musculares do manguito rotador.\n" +
      "* Formação expansiva heterogênea em partes moles (considerar processo neoplásico/sarcomatoso)."
  },
  {
    regiao: "Tornozelo",
    corpo:
      "* Rotura completa/parcial do tendão calcâneo (Achilles) com GAP entre os cotos.\n" +
      "* Tendinopatia e tenossinovite retro e inframaleolar dos fibulares (curto e longo).\n" +
      "* Distensão líquida/tenossinovite do tibial posterior e flexores dos dedos.\n" +
      "* Rotura completa/parcial do ligamento talofibular anterior (LTFA) e calcaneofibular (LCF).\n" +
      "* Lesão osteocondral no domus talar (ângulo medial/lateral) com edema medular.\n" +
      "* Fasciopatia plantar com espessamento da banda central e edema perifascial.\n" +
      "* Entesófito insercional do calcâneo e esporão plantar.\n" +
      "* Deformidade de Haglund (proeminência do calcâneo posterior) e bursite retrocalcaneana.\n" +
      "* Navicular acessório (tipo I/II) ou Coalizão/barra fibrocartilagínea calcaneonavicular.\n" +
      "* Sinovite/Derrame articular tibiotalar e subtalar posterior.\n" +
      "* Edema subcutâneo difuso ou perimaleolar.\n" +
      "* Retropé plano valgo."
  },
  {
    regiao: "Quadril / Bacia",
    corpo:
      "* Irregularidades condrais femoroacetabulares com fissuras profundas e exposição óssea.\n" +
      "* Rotura/fissura do lábio acetabular (predominio anterossuperior) associada a degeneração.\n" +
      "* Proeminência da transição cabeça-colo femoral (Impacto tipo Cam/Came).\n" +
      "* Proeminência da cobertura acetabular (Impacto tipo Pincer/Torquês).\n" +
      "* Osteonecrose da cabeça femoral (lesão geográfica) sem sinais de colapso.\n" +
      "* Tendinopatia e peritendinopatia insercional dos glúteos médio e mínimo (com ou sem rotura/atrofia).\n" +
      "* Tendinopatia/avulsão da origem dos isquiotibiais.\n" +
      "* Fratura/avulsão da espinha ilíaca anteroinferior (origem do reto femoral).\n" +
      "* Alterações degenerativas da sínfise púbica e das articulações sacroilíacas.\n" +
      "* Desinserção da base das aponeuroses retoadutoras (pubalgia).\n" +
      "* Bursite trocantérica/peritrocantérica."
  },
  {
    regiao: "Antepé",
    corpo:
      "* Fratura (aguda ou sequela) de metatarsos (colo/diáfise).\n" +
      "* Processo inflamatório/infeccioso ósseo (osteomielite) associado a ulceração cutânea.\n" +
      "* Condropatia da metatarsofalângica e glenossesamóideas do hálux.\n" +
      "* Bursite/distensão líquida das bursas intermetatÃ¡rsicas.\n" +
      "* Edema subcutâneo dorsal/plantar acentuado.\n" +
      "* Espessamento perineural nos espaços intermetatÃ¡rsicos (considerar Neuroma de Morton).\n" +
      "* Sinais de manipulação cirúrgica (transferências tendíneas/osteossíntese).\n" +
      "* Valgismo do hálux (joanete)."
  },
  {
    regiao: "Mão e Dedos",
    corpo:
      "* Rotura/desinserção do tendão extensor profundo com retração proximal.\n" +
      "* Fratura patológica (associada a lesão óssea como encondroma).\n" +
      "* Tenossinovite acentuada dos flexores.\n" +
      "* Alterações degenerativas das interfalângicas e metacarpofalângicas.\n" +
      "* Alteração cicatricial do ligamento colateral ulnar do polegar (dedo do goleiro).\n" +
      "* Cisto artrossinovial dorsal ou volar."
  },
  {
    regiao: "Punho",
    corpo:
      "* Cisto artrossinovial lobulado (volar radiocarpal/dorsal).\n" +
      "* Variação ulnar negativa ou positiva.\n" +
      "* Coalizão óssea carpal (ex: capitato-trapezóide).\n" +
      "* Espessamento/lesão de ligamentos intercarpais.\n" +
      "* Complexo da fibrocartilagem triangular de aspecto habitual ou lesionado."
  },
  {
    regiao: "Cotovelo",
    corpo:
      "* Tendinopatia da origem comum dos extensores (epicondilite lateral) com ou sem rotura parcial.\n" +
      "* Tendinopatia da origem comum dos flexores (epicondilite medial).\n" +
      "* Entesófito insercional do tríceps braquial.\n" +
      "* Nervo ulnar de espessura habitual, sem sinais de luxação."
  },
  {
    regiao: "Coxa",
    corpo:
      "* Rotura parcial/estiramento do ventre muscular do adutor longo (Grau II).\n" +
      "* Estiramento das fibras do músculo grácil.\n" +
      "* Edema de partes moles e coleções entre planos miofasciais.\n" +
      "* Tendinopatia da origem do bíceps femoral / semitendíneo."
  },
  {
    regiao: "Sacroilíacas",
    corpo:
      "* Irregularidades das superfícies articulares com discretas erosões e focos de edema subcondral.\n" +
      "* Alterações de aspecto sequelar (esclerose subcondral) sem sinais de osteíte ativa.\n" +
      "* Considerar possibilidade de artropatia inflamatória (sacroileíte) em atividade."
  },
  {
    regiao: "Sacrococcígea",
    corpo:
      "* Alinhamento sacrococcígeo preservado.\n" +
      "* Edema subcutâneo adjacente às peças coccígeas de aspecto mecânico.\n" +
      "* Espessamento discoligamentar intercoccígeo com remodelação das superfícies."
  }
];

export default templates_data;
```
