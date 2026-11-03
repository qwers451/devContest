/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import { Config } from "@remotion/cli/config";

Config.setRspack(true);
// Мелкий текст интерфейса: кадры без потерь (PNG). Битрейт фиксирован, чтобы
// ролик 60 fps ~66 с укладывался в 50 МБ: 5 Мбит/с видео + 192 кбит/с звук ≈ 43 МБ.
Config.setVideoImageFormat("png");
Config.setVideoBitrate("5M");
Config.setAudioBitrate("192k");
Config.setX264Preset("slow");
Config.setOverwriteOutput(true);
Config.setDefaultPremountInSeconds(2);
