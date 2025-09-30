# TradingView Fine-Tuning Data Collection System

Sistema completo para coleta de dados da TradingView para fine-tuning de modelos XGBoost.

## Componentes

### 1. Indicador PineScript
- **Localização**: `pinescript/tv-data-collector.pine`
- **Função**: Gera sinais PreData e PostData nos Pine Logs da TradingView
- **Features**: Detecção de sinais baseados em EMA/SMA crossovers, normalização por ATR

### 2. Extensão Chromium
- **Localização**: `browser-extension/`
- **Função**: Extrai dados dos Pine Logs virtuais e salva em arquivos JSON
- **Features**: Interface drag/resize, suporte multi-símbolo, navegação por datas

## Instalação

### PineScript
1. Copie o código de `pinescript/tv-data-collector.pine`
2. Cole no Pine Editor da TradingView
3. Configure os parâmetros desejados
4. Aplique ao gráfico

### Extensão Browser
1. Abra Chrome/Edge
2. Vá em Extensões → Modo Desenvolvedor
3. Clique em "Carregar extensão sem compactação"
4. Selecione a pasta `browser-extension`

## Uso

1. Configure o indicador PineScript no gráfico
2. Abra a extensão browser na TradingView
3. Configure símbolos e datas
4. Execute a coleta de dados
5. Os arquivos JSON serão salvos automaticamente

## Estrutura dos Dados

### PreData
```json
{
  "type": "PreData",
  "entry_datetime": "2023-01-01T12:00:00.000Z",
  "symbol": "CME_MINI:ES1!",
  "timeframe": "60m",
  "side": "long",
  "atr_percentage": 0.015,
  "sma200_distance": 2.5,
  ...
}
```

### PostData
```json
{
  "type": "PostData",
  "symbol": "CME_MINI:ES1!",
  "timeframe": "60m", 
  "side": "long",
  "maxATR": 4.2,
  "barsUntilMaxATR": 15,
  "minATR": -0.8,
  "barsUntilMinATR": 23
}
```

## Configuração

### Parâmetros do Indicador
- ATR Period: 200
- SMA Length: 200  
- EMA Length: 20
- Take Profit ATR Multiplier: 10
- OHLCV Array Length: 200
- Pullback Lookback Period: 20

### Lógica de Sinais
- **Long**: Close > SMA200, cross down EMA20 (bear) + next candle positive (bull)
- **Short**: Close < SMA200, cross up EMA20 (bull) + next candle negative (bear)
- **Reset**: 3 barras consecutivas na direção oposta ao crossover

## Desenvolvimento

Este projeto foi desenvolvido para coleta automatizada de dados de trading da TradingView com o objetivo de treinar modelos preditivos usando XGBoost.

## Licença

Uso interno - Heroes Invest Organization