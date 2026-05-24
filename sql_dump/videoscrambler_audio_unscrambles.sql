-- MySQL dump 10.13  Distrib 8.0.36, for Linux (x86_64)
--
-- Host: 34.57.139.74    Database: videoscrambler
-- ------------------------------------------------------
-- Server version	8.0.41-google

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
SET @MYSQLDUMP_TEMP_LOG_BIN = @@SESSION.SQL_LOG_BIN;
SET @@SESSION.SQL_LOG_BIN= 0;

--
-- GTID state at the beginning of the backup 
--

SET @@GLOBAL.GTID_PURGED=/*!80000 '+'*/ 'b1fb7176-d1f2-11f0-9251-42010a400002:1-3413';

--
-- Table structure for table `audio_unscrambles`
--

DROP TABLE IF EXISTS `audio_unscrambles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audio_unscrambles` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `userId` varchar(255) DEFAULT NULL,
  `username` varchar(255) DEFAULT NULL,
  `action_cost` int DEFAULT NULL,
  `creator` json DEFAULT NULL,
  `keyData` json DEFAULT NULL,
  `mediaDetails` json DEFAULT NULL,
  `watermark_params` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `audio_unscrambles`
--

LOCK TABLES `audio_unscrambles` WRITE;
/*!40000 ALTER TABLE `audio_unscrambles` DISABLE KEYS */;
INSERT INTO `audio_unscrambles` VALUES (1,'2026-03-03 04:58:14','G0FOMQ7T7A','ikemnkur',3,'{}',NULL,'{\"name\": \"recovered-audio_sample-15s-scrambled.wav\", \"size\": 3840044, \"channels\": 2, \"duration\": 20, \"sampleRate\": 48000}','{\"freq1\":47,\"freq2\":59,\"freq3\":36,\"pulseRate1\":0.125,\"pulseRate2\":0.25,\"pulseRate3\":0.5}'),(2,'2026-03-03 05:08:51','G0FOMQ7T7A','ikemnkur',3,'\"unknown\"','\"null\"','{\"name\": \"sample-15s-scrambled.wav\", \"size\": 4800044, \"channels\": 2, \"duration\": 25, \"sampleRate\": 48000}','{\"freq1\":47,\"freq2\":54,\"freq3\":41,\"pulseRate1\":0.125,\"pulseRate2\":0.25,\"pulseRate3\":0.5}'),(3,'2026-03-03 05:10:59','G0FOMQ7T7A','ikemnkur',3,'\"unknown\"','\"null\"','{\"name\": \"sample-15s-scrambled.wav\", \"size\": 4800044, \"channels\": 2, \"duration\": 25, \"sampleRate\": 48000}','{\"freq1\":51,\"freq2\":37,\"freq3\":57,\"pulseRate1\":0.125,\"pulseRate2\":0.25,\"pulseRate3\":0.5}'),(4,'2026-03-03 05:11:26','G0FOMQ7T7A','ikemnkur',3,'\"unknown\"','\"{\\\"timestamp\\\":\\\"2026-03-03T04:43:44.174Z\\\",\\\"audio\\\":{\\\"duration\\\":19.173875,\\\"sampleRate\\\":48000,\\\"channels\\\":2},\\\"shuffle\\\":{\\\"enabled\\\":true,\\\"seed\\\":272911907,\\\"segmentSize\\\":2,\\\"padding\\\":0.5,\\\"shuffleOrder\\\":[4,3,2,9,1,5,7,0,6,8]},\\\"noise\\\":{\\\"enabled\\\":true,\\\"seed\\\":603784047,\\\"level\\\":0.1,\\\"multiFrequency\\\":true},\\\"creator\\\":{\\\"username\\\":\\\"ikemnkur\\\",\\\"userId\\\":\\\"Unknown\\\",\\\"timestamp\\\":\\\"2026-03-03T04:43:44.174Z\\\"},\\\"metadata\\\":{\\\"filename\\\":\\\"sample-15s.wav\\\",\\\"size\\\":3382316,\\\"fileType\\\":\\\"audio/wav\\\",\\\"duration\\\":19.173875,\\\"sampleRate\\\":48000,\\\"channels\\\":2},\\\"type\\\":\\\"audio\\\",\\\"version\\\":\\\"basic\\\"}\"','{\"name\": \"sample-15s-scrambled.wav\", \"size\": 4800044, \"channels\": 2, \"duration\": 25, \"sampleRate\": 48000}','{\"freq1\":60,\"freq2\":37,\"freq3\":44,\"pulseRate1\":0.125,\"pulseRate2\":0.25,\"pulseRate3\":0.5}'),(5,'2026-03-03 05:30:27','G0FOMQ7T7A','ikemnkur',3,'\"unknown\"','\"{\\\"timestamp\\\":\\\"2026-03-03T04:43:44.174Z\\\",\\\"audio\\\":{\\\"duration\\\":19.173875,\\\"sampleRate\\\":48000,\\\"channels\\\":2},\\\"shuffle\\\":{\\\"enabled\\\":true,\\\"seed\\\":272911907,\\\"segmentSize\\\":2,\\\"padding\\\":0.5,\\\"shuffleOrder\\\":[4,3,2,9,1,5,7,0,6,8]},\\\"noise\\\":{\\\"enabled\\\":true,\\\"seed\\\":603784047,\\\"level\\\":0.1,\\\"multiFrequency\\\":true},\\\"creator\\\":{\\\"username\\\":\\\"ikemnkur\\\",\\\"userId\\\":\\\"Unknown\\\",\\\"timestamp\\\":\\\"2026-03-03T04:43:44.174Z\\\"},\\\"metadata\\\":{\\\"filename\\\":\\\"sample-15s.wav\\\",\\\"size\\\":3382316,\\\"fileType\\\":\\\"audio/wav\\\",\\\"duration\\\":19.173875,\\\"sampleRate\\\":48000,\\\"channels\\\":2},\\\"type\\\":\\\"audio\\\",\\\"version\\\":\\\"basic\\\"}\"','{\"name\": \"sample-15s-scrambled.wav\", \"size\": 4800044, \"channels\": 2, \"duration\": 25, \"sampleRate\": 48000}','{\"freq1\":41,\"freq2\":59,\"freq3\":51,\"pulseRate1\":0.125,\"pulseRate2\":0.25,\"pulseRate3\":0.5}'),(6,'2026-03-03 05:32:35','G0FOMQ7T7A','ikemnkur',3,'\"unknown\"','\"{\\\"timestamp\\\":\\\"2026-03-03T04:43:44.174Z\\\",\\\"audio\\\":{\\\"duration\\\":19.173875,\\\"sampleRate\\\":48000,\\\"channels\\\":2},\\\"shuffle\\\":{\\\"enabled\\\":true,\\\"seed\\\":272911907,\\\"segmentSize\\\":2,\\\"padding\\\":0.5,\\\"shuffleOrder\\\":[4,3,2,9,1,5,7,0,6,8]},\\\"noise\\\":{\\\"enabled\\\":true,\\\"seed\\\":603784047,\\\"level\\\":0.1,\\\"multiFrequency\\\":true},\\\"creator\\\":{\\\"username\\\":\\\"ikemnkur\\\",\\\"userId\\\":\\\"Unknown\\\",\\\"timestamp\\\":\\\"2026-03-03T04:43:44.174Z\\\"},\\\"metadata\\\":{\\\"filename\\\":\\\"sample-15s.wav\\\",\\\"size\\\":3382316,\\\"fileType\\\":\\\"audio/wav\\\",\\\"duration\\\":19.173875,\\\"sampleRate\\\":48000,\\\"channels\\\":2},\\\"type\\\":\\\"audio\\\",\\\"version\\\":\\\"basic\\\"}\"','{\"name\": \"sample-15s-scrambled.wav\", \"size\": 4800044, \"channels\": 2, \"duration\": 25, \"sampleRate\": 48000}','{\"freq1\":38,\"freq2\":57,\"freq3\":44,\"pulseRate1\":0.125,\"pulseRate2\":0.25,\"pulseRate3\":0.5}'),(7,'2026-03-03 05:33:14','G0FOMQ7T7A','ikemnkur',3,'\"unknown\"','\"{\\\"timestamp\\\":\\\"2026-03-03T04:43:44.174Z\\\",\\\"audio\\\":{\\\"duration\\\":19.173875,\\\"sampleRate\\\":48000,\\\"channels\\\":2},\\\"shuffle\\\":{\\\"enabled\\\":true,\\\"seed\\\":272911907,\\\"segmentSize\\\":2,\\\"padding\\\":0.5,\\\"shuffleOrder\\\":[4,3,2,9,1,5,7,0,6,8]},\\\"noise\\\":{\\\"enabled\\\":true,\\\"seed\\\":603784047,\\\"level\\\":0.1,\\\"multiFrequency\\\":true},\\\"creator\\\":{\\\"username\\\":\\\"ikemnkur\\\",\\\"userId\\\":\\\"Unknown\\\",\\\"timestamp\\\":\\\"2026-03-03T04:43:44.174Z\\\"},\\\"metadata\\\":{\\\"filename\\\":\\\"sample-15s.wav\\\",\\\"size\\\":3382316,\\\"fileType\\\":\\\"audio/wav\\\",\\\"duration\\\":19.173875,\\\"sampleRate\\\":48000,\\\"channels\\\":2},\\\"type\\\":\\\"audio\\\",\\\"version\\\":\\\"basic\\\"}\"','{\"name\": \"sample-15s-scrambled.wav\", \"size\": 4800044, \"channels\": 2, \"duration\": 25, \"sampleRate\": 48000}','{\"freq1\":38,\"freq2\":46,\"freq3\":55,\"pulseRate1\":0.125,\"pulseRate2\":0.25,\"pulseRate3\":0.5}'),(8,'2026-03-03 05:34:11','G0FOMQ7T7A','ikemnkur',3,'\"unknown\"','\"{\\\"timestamp\\\":\\\"2026-03-03T04:43:44.174Z\\\",\\\"audio\\\":{\\\"duration\\\":19.173875,\\\"sampleRate\\\":48000,\\\"channels\\\":2},\\\"shuffle\\\":{\\\"enabled\\\":true,\\\"seed\\\":272911907,\\\"segmentSize\\\":2,\\\"padding\\\":0.5,\\\"shuffleOrder\\\":[4,3,2,9,1,5,7,0,6,8]},\\\"noise\\\":{\\\"enabled\\\":true,\\\"seed\\\":603784047,\\\"level\\\":0.1,\\\"multiFrequency\\\":true},\\\"creator\\\":{\\\"username\\\":\\\"ikemnkur\\\",\\\"userId\\\":\\\"Unknown\\\",\\\"timestamp\\\":\\\"2026-03-03T04:43:44.174Z\\\"},\\\"metadata\\\":{\\\"filename\\\":\\\"sample-15s.wav\\\",\\\"size\\\":3382316,\\\"fileType\\\":\\\"audio/wav\\\",\\\"duration\\\":19.173875,\\\"sampleRate\\\":48000,\\\"channels\\\":2},\\\"type\\\":\\\"audio\\\",\\\"version\\\":\\\"basic\\\"}\"','{\"name\": \"sample-15s-scrambled.wav\", \"size\": 4800044, \"channels\": 2, \"duration\": 25, \"sampleRate\": 48000}','{\"freq1\":49,\"freq2\":31,\"freq3\":55,\"pulseRate1\":0.125,\"pulseRate2\":0.25,\"pulseRate3\":0.5}'),(9,'2026-03-03 05:40:19','G0FOMQ7T7A','ikemnkur',3,'\"unknown\"','\"{\\\"timestamp\\\":\\\"2026-03-03T04:43:44.174Z\\\",\\\"audio\\\":{\\\"duration\\\":19.173875,\\\"sampleRate\\\":48000,\\\"channels\\\":2},\\\"shuffle\\\":{\\\"enabled\\\":true,\\\"seed\\\":272911907,\\\"segmentSize\\\":2,\\\"padding\\\":0.5,\\\"shuffleOrder\\\":[4,3,2,9,1,5,7,0,6,8]},\\\"noise\\\":{\\\"enabled\\\":true,\\\"seed\\\":603784047,\\\"level\\\":0.1,\\\"multiFrequency\\\":true},\\\"creator\\\":{\\\"username\\\":\\\"ikemnkur\\\",\\\"userId\\\":\\\"Unknown\\\",\\\"timestamp\\\":\\\"2026-03-03T04:43:44.174Z\\\"},\\\"metadata\\\":{\\\"filename\\\":\\\"sample-15s.wav\\\",\\\"size\\\":3382316,\\\"fileType\\\":\\\"audio/wav\\\",\\\"duration\\\":19.173875,\\\"sampleRate\\\":48000,\\\"channels\\\":2},\\\"type\\\":\\\"audio\\\",\\\"version\\\":\\\"basic\\\"}\"','{\"name\": \"sample-15s-scrambled.wav\", \"size\": 4800044, \"channels\": 2, \"duration\": 25, \"sampleRate\": 48000}','{\"freq1\":42,\"freq2\":59,\"freq3\":54,\"pulseRate1\":0.125,\"pulseRate2\":0.25,\"pulseRate3\":0.5}'),(10,'2026-03-03 05:41:37','G0FOMQ7T7A','ikemnkur',3,'\"unknown\"','\"{\\\"timestamp\\\":\\\"2026-03-03T04:43:44.174Z\\\",\\\"audio\\\":{\\\"duration\\\":19.173875,\\\"sampleRate\\\":48000,\\\"channels\\\":2},\\\"shuffle\\\":{\\\"enabled\\\":true,\\\"seed\\\":272911907,\\\"segmentSize\\\":2,\\\"padding\\\":0.5,\\\"shuffleOrder\\\":[4,3,2,9,1,5,7,0,6,8]},\\\"noise\\\":{\\\"enabled\\\":true,\\\"seed\\\":603784047,\\\"level\\\":0.1,\\\"multiFrequency\\\":true},\\\"creator\\\":{\\\"username\\\":\\\"ikemnkur\\\",\\\"userId\\\":\\\"Unknown\\\",\\\"timestamp\\\":\\\"2026-03-03T04:43:44.174Z\\\"},\\\"metadata\\\":{\\\"filename\\\":\\\"sample-15s.wav\\\",\\\"size\\\":3382316,\\\"fileType\\\":\\\"audio/wav\\\",\\\"duration\\\":19.173875,\\\"sampleRate\\\":48000,\\\"channels\\\":2},\\\"type\\\":\\\"audio\\\",\\\"version\\\":\\\"basic\\\"}\"','{\"name\": \"sample-15s-scrambled.wav\", \"size\": 4800044, \"channels\": 2, \"duration\": 25, \"sampleRate\": 48000}','{\"freq1\":31,\"freq2\":57,\"freq3\":52,\"pulseRate1\":0.125,\"pulseRate2\":0.25,\"pulseRate3\":0.5}'),(11,'2026-03-03 05:42:54','G0FOMQ7T7A','ikemnkur',3,'\"unknown\"','\"{\\\"timestamp\\\":\\\"2026-03-03T04:43:44.174Z\\\",\\\"audio\\\":{\\\"duration\\\":19.173875,\\\"sampleRate\\\":48000,\\\"channels\\\":2},\\\"shuffle\\\":{\\\"enabled\\\":true,\\\"seed\\\":272911907,\\\"segmentSize\\\":2,\\\"padding\\\":0.5,\\\"shuffleOrder\\\":[4,3,2,9,1,5,7,0,6,8]},\\\"noise\\\":{\\\"enabled\\\":true,\\\"seed\\\":603784047,\\\"level\\\":0.1,\\\"multiFrequency\\\":true},\\\"creator\\\":{\\\"username\\\":\\\"ikemnkur\\\",\\\"userId\\\":\\\"Unknown\\\",\\\"timestamp\\\":\\\"2026-03-03T04:43:44.174Z\\\"},\\\"metadata\\\":{\\\"filename\\\":\\\"sample-15s.wav\\\",\\\"size\\\":3382316,\\\"fileType\\\":\\\"audio/wav\\\",\\\"duration\\\":19.173875,\\\"sampleRate\\\":48000,\\\"channels\\\":2},\\\"type\\\":\\\"audio\\\",\\\"version\\\":\\\"basic\\\"}\"','{\"name\": \"sample-15s-scrambled.wav\", \"size\": 4800044, \"channels\": 2, \"duration\": 25, \"sampleRate\": 48000}','{\"freq1\":48,\"freq2\":34,\"freq3\":39,\"pulseRate1\":0.125,\"pulseRate2\":0.25,\"pulseRate3\":0.5}'),(12,'2026-03-03 05:44:16','G0FOMQ7T7A','ikemnkur',3,'{\"userId\": \"Unknown\", \"username\": \"ikemnkur\", \"timestamp\": \"2026-03-03T04:43:44.174Z\"}','\"{\\\"timestamp\\\":\\\"2026-03-03T04:43:44.174Z\\\",\\\"audio\\\":{\\\"duration\\\":19.173875,\\\"sampleRate\\\":48000,\\\"channels\\\":2},\\\"shuffle\\\":{\\\"enabled\\\":true,\\\"seed\\\":272911907,\\\"segmentSize\\\":2,\\\"padding\\\":0.5,\\\"shuffleOrder\\\":[4,3,2,9,1,5,7,0,6,8]},\\\"noise\\\":{\\\"enabled\\\":true,\\\"seed\\\":603784047,\\\"level\\\":0.1,\\\"multiFrequency\\\":true},\\\"creator\\\":{\\\"username\\\":\\\"ikemnkur\\\",\\\"userId\\\":\\\"Unknown\\\",\\\"timestamp\\\":\\\"2026-03-03T04:43:44.174Z\\\"},\\\"metadata\\\":{\\\"filename\\\":\\\"sample-15s.wav\\\",\\\"size\\\":3382316,\\\"fileType\\\":\\\"audio/wav\\\",\\\"duration\\\":19.173875,\\\"sampleRate\\\":48000,\\\"channels\\\":2},\\\"type\\\":\\\"audio\\\",\\\"version\\\":\\\"basic\\\"}\"','{\"name\": \"sample-15s-scrambled.wav\", \"size\": 4800044, \"channels\": 2, \"duration\": 25, \"sampleRate\": 48000}','{\"freq1\":48,\"freq2\":40,\"freq3\":34,\"pulseRate1\":0.125,\"pulseRate2\":0.25,\"pulseRate3\":0.5}');
/*!40000 ALTER TABLE `audio_unscrambles` ENABLE KEYS */;
UNLOCK TABLES;
SET @@SESSION.SQL_LOG_BIN = @MYSQLDUMP_TEMP_LOG_BIN;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-03-06 22:06:33
