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
-- Table structure for table `CryptoTransactions_LTC`
--

DROP TABLE IF EXISTS `CryptoTransactions_LTC`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `CryptoTransactions_LTC` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `time` varchar(255) DEFAULT NULL,
  `direction` varchar(255) DEFAULT NULL,
  `amount` varchar(255) DEFAULT NULL,
  `fromAddress` varchar(255) DEFAULT NULL,
  `toAddress` varchar(255) DEFAULT NULL,
  `hash` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `CryptoTransactions_LTC`
--

LOCK TABLES `CryptoTransactions_LTC` WRITE;
/*!40000 ALTER TABLE `CryptoTransactions_LTC` DISABLE KEYS */;
INSERT INTO `CryptoTransactions_LTC` VALUES (1,'2025-11-01 15:48:35.000 UTC','IN','0.05063804','ltc1qm2ewl6pzujlq7j70dkwpkzh9fupxrdn8w2na5r','ltc1qgg5aggedmvjx0grd2k5shg6jvkdzt9dtcqa4dh','b8e47da78beec8a411259482125041131babf4a131801759e715a4bc5c760d2e','2025-11-10 05:00:01'),(2,'2025-11-01 00:45:36.000 UTC','IN','0.02101061','ltc1qyu50pytvc08yd5f2ycy4fd58nlmuhnwt4wwmyn','ltc1qgg5aggedmvjx0grd2k5shg6jvkdzt9dtcqa4dh','40aa886e5202c1f96223a253c114abe570c82d665569fe186739cd80d6a06a5a','2025-11-10 05:00:01'),(3,'2025-10-20 00:40:23.000 UTC','IN','0.027','ltc1q0p5tnqln0x2htpp0rhxh5n77mmzmnqxqxsrv0w','ltc1qgg5aggedmvjx0grd2k5shg6jvkdzt9dtcqa4dh','c0ebfcbdb27602f1bebbc6033f02c922d7753f50c131056bf96c094ddcd35809','2025-11-10 05:00:01'),(4,'2025-10-19 19:28:42.000 UTC','IN','0.0266269','ltc1qyu50pytvc08yd5f2ycy4fd58nlmuhnwt4wwmyn','ltc1qgg5aggedmvjx0grd2k5shg6jvkdzt9dtcqa4dh','1c1ea540a537e931d9278b48b7e98581220d903ca372fa33b8e5c6251c810ae5','2025-11-10 05:00:01'),(5,'2025-10-18 21:24:49.000 UTC','IN','0.05443066','ltc1qyu50pytvc08yd5f2ycy4fd58nlmuhnwt4wwmyn','ltc1qgg5aggedmvjx0grd2k5shg6jvkdzt9dtcqa4dh','3900e0e289381eb7a941640b4a6742a2bd20edc9dd3d7ffc409c49fbfc241045','2025-11-10 05:00:01'),(6,'2025-10-18 04:30:22.000 UTC','IN','0.10665482','ltc1qyu50pytvc08yd5f2ycy4fd58nlmuhnwt4wwmyn','ltc1qgg5aggedmvjx0grd2k5shg6jvkdzt9dtcqa4dh','57268232f6a18ae1085bc68a78b27d5a2ca2f81cd361e671bcff02b4d9523b8b','2025-11-10 05:00:01'),(7,'2025-10-05 01:12:52.000 UTC','IN','0.01649213','ltc1qyu50pytvc08yd5f2ycy4fd58nlmuhnwt4wwmyn','ltc1qgg5aggedmvjx0grd2k5shg6jvkdzt9dtcqa4dh','3fd224d82484bc9f4482b1bb27acbd4d33cc8d0a81e64e31f3bd497a994a20df','2025-11-10 05:00:01'),(8,'2025-10-04 23:38:28.000 UTC','IN','0.0415835','ltc1qyu50pytvc08yd5f2ycy4fd58nlmuhnwt4wwmyn','ltc1qgg5aggedmvjx0grd2k5shg6jvkdzt9dtcqa4dh','5aad284f9c92ad5573b3d909e57a4914558d99065fb8449d6edcb9eb0a5373c8','2025-11-10 05:00:01'),(9,'2025-10-04 00:08:43.000 UTC','OUT','0.01914703','ltc1qgg5aggedmvjx0grd2k5shg6jvkdzt9dtcqa4dh','ltc1qtu0qyl057lcm4r0z898lzt42x7r20mfex28v5k','53c9b8776385ce5766d792771ffca02d5b17e6ab2da65d4c4ad06f163fcbbcd4','2025-11-10 05:00:01'),(10,'2025-09-26 22:25:20.000 UTC','IN','0.01434857','ltc1qyu50pytvc08yd5f2ycy4fd58nlmuhnwt4wwmyn','ltc1qgg5aggedmvjx0grd2k5shg6jvkdzt9dtcqa4dh','6176a443a084d04e2e7cfe91c8d864a8803f982b1e009a4a84761565e0dc9d5b','2025-11-10 05:00:01'),(11,'2025-09-26 21:50:31.000 UTC','IN','0.00479846','ltc1qyu50pytvc08yd5f2ycy4fd58nlmuhnwt4wwmyn','ltc1qgg5aggedmvjx0grd2k5shg6jvkdzt9dtcqa4dh','5f3b4567ef29ac2f7cbc6bdcd824c74948d85078cef52c609d37e5e6d00602a6','2025-11-10 05:00:01'),(12,'','IN','0.001633','ltc1qyu50pytvc08yd5f2ycy4fd58nlmuhnwt4wwmyn','ltc1qgg5aggedmvjx0grd2k5shg6jvkdzt9dtcqa4dh','0a25f4038487b8a1ba928b78d4f3f0d9d957a4756beeb3a06c6a25b4ec673013','2026-01-30 23:00:00'),(13,'','IN','0.001797','ltc1qyu50pytvc08yd5f2ycy4fd58nlmuhnwt4wwmyn','ltc1qgg5aggedmvjx0grd2k5shg6jvkdzt9dtcqa4dh','f19abc693704b16eb35d0932ad58e9274f7497781834d9e4e3222599bb53a75f','2026-01-30 23:00:00'),(14,'2026-01-30 23:23:06.000 UTC','IN','0.002897','ltc1qsf8n7vr8m8paz3twpmnrtyevzuskswnmaqp3kw','ltc1qgg5aggedmvjx0grd2k5shg6jvkdzt9dtcqa4dh','e574bee0c91357cc79925440db93e5bde40bba28e55599a9b3e63794dbb83509','2026-01-30 23:30:00'),(15,'2026-01-30 23:47:03.000 UTC','IN','0.00202792','ltc1qlws687us3ysrjegwvdev44q76yhkuv4x75s2qk','ltc1qgg5aggedmvjx0grd2k5shg6jvkdzt9dtcqa4dh','f228757e61930c6283678ebc40a1af011982d983aeb1e9e90ee80bf15443b41a','2026-01-31 00:00:00'),(16,'2026-02-02 03:24:24.000 UTC','OUT','0.35279158','ltc1qgg5aggedmvjx0grd2k5shg6jvkdzt9dtcqa4dh','MPUUWsxdbyJiy6kRcFNhxtQBpmFviCbuxT','cf43d0ba8267e0c81082c4155f526cc272559ec82230fc4612a3e85bd8a626fd','2026-02-02 03:30:04');
/*!40000 ALTER TABLE `CryptoTransactions_LTC` ENABLE KEYS */;
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

-- Dump completed on 2026-03-06 22:06:04
