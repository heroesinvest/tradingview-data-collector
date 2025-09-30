# TradingView Fine-Tuning Data Collection System

## Visão Geral

Este sistema foi desenvolvido para coletar dados de trading da TradingView de forma automatizada, gerando arquivos JSON estruturados para fine-tuning de modelos XGBoost. O sistema é composto por dois componentes principais:

1. **Indicador PineScript**: Gera sinais PreData e PostData nos Pine Logs
2. **Extensão Chromium**: Extrai esses dados automaticamente e salva em arquivos JSON

## 📋 Pré-requisitos

- TradingView Pro/Premium (para Pine Logs avançados)
- Chrome/Edge Browser  
- Conta TradingView com acesso ao Pine Editor
- Conhecimento básico em PineScript e JSON

## 🚀 Instalação Rápida

### 1. Indicador PineScript

1. Abra o [Pine Editor](https://www.tradingview.com/pine-editor/) na TradingView
2. Copie todo o código de `pinescript/tv-data-collector.pine`
3. Cole no editor Pine Script
4. Clique em "Add to Chart"
5. Configure os parâmetros conforme necessário

### 2. Extensão Browser

1. Abra Chrome/Edge
2. Vá para `chrome://extensions/` ou `edge://extensions/`
3. Ative o "Modo desenvolvedor"
4. Clique em "Carregar extensão sem compactação"
5. Selecione a pasta `browser-extension`
6. A extensão será instalada e o ícone aparecerá na barra

## ⚙️ Configuração Detalhada

### Parâmetros do Indicador PineScript

#### Indicadores Base
- **ATR Period**: 200 (período para cálculo do ATR)
- **SMA Length**: 200 (média móvel simples longa)
- **EMA Length**: 20 (média móvel exponencial rápida)

#### Parâmetros de Trade
- **Take Profit ATR Multiplier**: 10 (multiplicador para take profit)
- **OHLCV Array Length**: 200 (tamanho do array OHLCV histórico)
- **Pullback Lookback Period**: 20 (período para análise de pullback)

#### Filtros e Visualização
- **Enable Date Filter**: Para limitar sinais por período
- **Show Lines**: Exibir linhas de entrada, stop loss e take profit
- **Show ATR Size**: Mostrar tabela com informações do ATR
- **Enable Alerts**: Ativar alertas para webhooks

### Configuração da Extensão

#### Upload de Símbolos
1. Crie um arquivo `.txt` com um símbolo por linha:
```
CME_MINI:ES1!
BINANCE:BTCUSDT.P
NASDAQ:AAPL
```

2. Faça upload do arquivo na extensão

#### Configuração de Datas
- **Start Date**: Data inicial para coleta histórica
- **End Date**: Data final para coleta histórica
- **Sem datas**: Coleta apenas dados atuais disponíveis

## 📊 Lógica de Sinais

### Condições de Entrada

#### Sinais Long
1. Close deve estar **acima** da SMA200
2. Preço deve **cruzar para baixo** a EMA20 (candle bear)
3. Próximo candle deve ser **positivo** (bull)
4. Reset após 3 closes consecutivos acima da EMA20

#### Sinais Short  
1. Close deve estar **abaixo** da SMA200
2. Preço deve **cruzar para cima** a EMA20 (candle bull)
3. Próximo candle deve ser **negativo** (bear)
4. Reset após 3 closes consecutivos abaixo da EMA20

### Condições de Saída (PostData)

#### Exit Conditions
- **Stop Loss**: -1 ATR (posição contrária)
- **Take Profit**: +10 ATR (posição favorável)
- **Time Limit**: Máximo de barras configurável

#### Classificação de Trades
- **Positivos**: Atingem +10 ATR antes de -1 ATR
- **Negativos**: Atingem -1 ATR antes de +10 ATR
- **Neutros**: Atingem limite de tempo sem atingir targets

## 📁 Estrutura dos Dados

### PreData (Features de Entrada)

```json
{
  "type": "PreData",
  "entry_datetime": "2023-07-15T14:30:00.000Z",
  "symbol": "CME_MINI:ES1!",
  "timeframe": "60m",
  "side": "long",
  
  // Features normalizadas por ATR
  "atr_percentage": 0.0234,
  "sma200_distance": 2.15,
  "ema20_distance": 0.85,
  "ema_sma_spread": 1.30,
  
  // Slopes (inclinações)
  "ema20_slope_5bar": 0.12,
  "sma200_slope_20bar": 0.05,
  
  // Volume Delta (diferenças de volume)
  "volumeDelta_1bar": 150.5,
  "volumeDelta_5bar": 320.8,
  "volumeDelta_20bar": 890.2,
  // ... até 200 barras
  
  // Returns (retornos)
  "return_5bar": 1.25,
  "return_20bar": 2.80,
  "return_50bar": 4.15,
  // ... até 200 barras
  
  // Formato da barra atual
  "bar_range": 2.45,
  "bar_body": 1.80,
  "upper_wick": 0.35,
  "lower_wick": 0.30,
  
  // Volume
  "volume_ratio": 1.35,
  "volume_zscore": 0.85,
  
  // Pullback
  "pullback_up": 3.20,
  "pullback_down": 1.45,
  
  // Arrays OHLCV (200 barras históricas)
  "ohlcv": {
    "open": [0.12, 0.45, ...],
    "high": [0.67, 0.89, ...],
    "low": [-0.23, -0.15, ...],
    "close": [0.34, 0.56, ...]
  }
}
```

### PostData (Resultados de Saída)

```json
{
  "type": "PostData",
  "entry_datetime": "2023-07-15T14:30:00.000Z",
  "symbol": "CME_MINI:ES1!",
  "timeframe": "60m",
  "side": "long",
  
  // Métricas de performance
  "maxATR": 4.2,           // Máximo ATR favorável atingido
  "barsUntilMaxATR": 15,   // Barras até atingir maxATR
  "minATR": -0.8,          // Mínimo ATR (contra posição)
  "barsUntilMinATR": 23,   // Barras até atingir minATR
  
  // Classificação
  "exit_reason": "take_profit", // "take_profit", "stop_loss", "time_limit"
  "signal_number": 42      // Número sequencial do sinal
}
```

## 🔄 Fluxo de Uso

### 1. Preparação
1. Configure o indicador PineScript no gráfico desejado
2. Verifique se os Pine Logs estão visíveis
3. Instale e configure a extensão browser

### 2. Coleta de Dados
1. Abra a extensão na TradingView
2. Configure símbolos (upload opcional) e datas
3. Clique em "Start Collection"
4. Monitore o progresso em tempo real
5. Arquivos JSON serão salvos automaticamente

### 3. Processamento
1. Os arquivos seguem a nomenclatura: `{Ticker}-{Timeframe}-{StartDate}-{EndDate}.json`
2. Cada arquivo contém um array de objetos JSON
3. PreData e PostData são sincronizados por `entry_datetime`

## 📋 Nomenclatura de Arquivos

```
Formato: {Ticker}-{Timeframe}-{FirstSignal}-{LastSignal}.json

Exemplos:
- ES-60m-20230115-1430-20231215-1630.json
- BTCUSDT_P-60m-20230301-0900-20230331-2100.json
- AAPL-60m-20230601-1000-20230630-1500.json
```

## 🛠️ Troubleshooting

### Problemas Comuns

#### PineScript não gera logs
- Verifique se alertas estão habilitados
- Confirme que o indicador está aplicado ao gráfico
- Certifique-se de que há sinais válidos no período

#### Extensão não encontra dados
- Verifique se Pine Logs panel está visível
- Confirme que há dados nos logs
- Tente recarregar a página da TradingView

#### Arquivos não são salvos
- Permita downloads automáticos no browser
- Verifique as configurações de download
- Tente executar em modo incógnito

#### Dados duplicados
- O sistema tem deduplicação automática baseada em chaves únicas
- Se persistir, verifique se está coletando o mesmo período múltiplas vezes

### Performance e Limites

#### Limitações do PineScript
- Máximo de 5000 barras históricas
- Limite de memória por script
- Processamento sequencial (não paralelo)

#### Limitações da Extensão
- Depende da virtual list do TradingView
- Pode ser afetada por mudanças na interface
- Processamento limitado por recursos do browser

## 🔧 Customização

### Modificando Features PreData

Para adicionar novas features ao PreData, edite a função `extract_predata_features()`:

```pine
// Exemplo: Adicionar RSI normalizado
rsi_14 = ta.rsi(close, 14)
rsi_normalized = round3((rsi_14 - 50) / 50) // Normalizar RSI para [-1, 1]

// Adicionar ao JSON payload
json_payload += ',"rsi_normalized":' + str.tostring(rsi_normalized)
```

### Modificando Condições de Entrada

Para alterar as condições de sinal, edite as variáveis `long_signal` e `short_signal`:

```pine
// Exemplo: Adicionar condição de volume
volume_condition = volume > ta.sma(volume, 20) * 1.5

// Modificar condições
long_signal = sma_trend_up and ema_cross_down and volume_condition and not last_signal_long
```

### Personalizando a Extensão

Para modificar a interface da extensão, edite `popup.html` e `popup.js`:

```javascript
// Exemplo: Adicionar novo campo de configuração
const customParam = document.getElementById('customParam').value;

// Incluir na configuração enviada
const collectionConfig = {
    symbols: this.symbols,
    startDate: document.getElementById('startDate').value,
    endDate: document.getElementById('endDate').value,
    customParam: customParam, // Novo parâmetro
    command: 'startCollection'
};
```

## 📈 Análise dos Dados

### Métricas Importantes

#### Para PreData
- **ATR Percentage**: Volatilidade relativa do ativo
- **Distance Features**: Posição relativa às médias móveis  
- **Volume Features**: Atividade de mercado
- **Pullback Features**: Força dos movimentos contrários

#### Para PostData
- **MaxATR**: Potencial de ganho máximo atingido
- **BarsUntilMaxATR**: Velocidade para atingir ganhos
- **MinATR**: Maior drawdown da posição
- **Exit Reason**: Tipo de saída do trade

### Exemplo de Análise

```python
import pandas as pd
import json

# Carregar dados
with open('ES-60m-20230101-0000-20231231-2359.json', 'r') as f:
    data = json.load(f)

# Separar PreData e PostData
predata = [item for item in data if item['type'] == 'PreData']
postdata = [item for item in data if item['type'] == 'PostData']

# Converter para DataFrames
pre_df = pd.DataFrame(predata)
post_df = pd.DataFrame(postdata)

# Sincronizar por entry_datetime
merged_df = pre_df.merge(post_df, on='entry_datetime', suffixes=('_pre', '_post'))

# Análise básica
win_rate = len(merged_df[merged_df['maxATR'] >= 4]) / len(merged_df)
avg_bars_to_target = merged_df[merged_df['maxATR'] >= 4]['barsUntilMaxATR'].mean()

print(f"Win Rate (>=4 ATR): {win_rate:.2%}")
print(f"Average Bars to Target: {avg_bars_to_target:.1f}")
```

## 🤝 Contribuição

### Reportando Bugs
1. Descreva o problema detalhadamente
2. Inclua logs do console (F12)
3. Especifique browser e versão do TradingView
4. Forneça passos para reproduzir

### Sugerindo Melhorias
1. Descreva o objetivo da melhoria
2. Explique o benefício esperado
3. Forneça exemplos ou mockups se aplicável

### Desenvolvimento
1. Fork o repositório
2. Crie uma branch para sua feature
3. Implemente e teste as mudanças
4. Submeta um pull request com descrição detalhada

## 📝 Licença

Este projeto é de uso interno da Heroes Invest Organization. Todos os direitos reservados.

## 📞 Suporte

Para suporte técnico ou dúvidas:
- Abra uma issue no GitHub
- Consulte a documentação completa
- Verifique os logs de erro no console do browser

---

**Versão**: 1.0.0  
**Última atualização**: 30 de Setembro de 2025  
**Autor**: Heroes Invest Development Team