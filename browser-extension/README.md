# TradingView Data Collector - Browser Extension

Chrome/Edge extension for extracting PreData and PostData from TradingView Pine Logs.

## Installation

1. Open Chrome/Edge
2. Go to `chrome://extensions/` or `edge://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked extension"
5. Select this folder

## Usage

1. Navigate to TradingView with your Pine Script indicator loaded
2. Click the extension icon to open the control panel
3. Configure symbols and date ranges (optional)
4. Click "Start Collection" to begin data extraction
5. JSON files will be automatically downloaded

## Features

- **Virtual List Support**: Handles TradingView's virtual scrolling Pine Logs
- **Multi-Symbol Collection**: Process multiple symbols from uploaded file
- **Date Range Navigation**: Collect historical data using replay mode
- **Deduplication**: Robust logic to prevent duplicate entries
- **Real-time Progress**: Live updates and statistics
- **Drag & Resize**: Moveable and resizable UI panel

## File Output

Files are saved with the naming convention:
`{Ticker}-{Timeframe}-{StartDate}-{EndDate}.json`

Example: `ES-60m-20230101-1200-20231231-2359.json`

## Configuration

- Upload a text file with symbols (one per line) for batch processing
- Set start/end dates for historical data collection
- Monitor progress in real-time with timers and counters

## Data Format

### PreData Example
```json
{
  "type": "PreData",
  "entry_datetime": "2023-07-15T14:30:00.000Z",
  "symbol": "CME_MINI:ES1!",
  "timeframe": "60m",
  "side": "long",
  "atr_percentage": 0.0234,
  "sma200_distance": 2.15,
  "ema20_distance": 0.85,
  // ... additional features
}
```

### PostData Example
```json
{
  "type": "PostData",
  "entry_datetime": "2023-07-15T14:30:00.000Z",
  "symbol": "CME_MINI:ES1!",
  "timeframe": "60m",
  "side": "long",
  "maxATR": 4.2,
  "barsUntilMaxATR": 15,
  "minATR": -0.8,
  "barsUntilMinATR": 23,
  "exit_reason": "take_profit"
}
```

## Troubleshooting

- Ensure Pine Script indicator is loaded and generating logs
- Check that Pine Logs panel is visible in TradingView
- Verify symbols are correctly formatted (EXCHANGE:TICKER)
- Allow downloads in browser if files aren't saving

## Technical Details

- Uses Manifest V3 for modern Chrome compatibility
- Implements virtual list scrolling detection
- Handles React/Vue.js component inspection
- Robust deduplication using composite keys