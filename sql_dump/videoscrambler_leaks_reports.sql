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
-- Table structure for table `leaks_reports`
--

DROP TABLE IF EXISTS `leaks_reports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `leaks_reports` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `username` varchar(255) DEFAULT NULL,
  `creatorId` varchar(255) DEFAULT NULL,
  `keyData` json DEFAULT NULL,
  `decodeData` json DEFAULT NULL,
  `originalMedia` varchar(255) DEFAULT NULL,
  `leakedMedia` varchar(255) DEFAULT NULL,
  `potentialLeakers` text,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `leaks_reports`
--

LOCK TABLES `leaks_reports` WRITE;
/*!40000 ALTER TABLE `leaks_reports` DISABLE KEYS */;
INSERT INTO `leaks_reports` VALUES (1,'2026-02-10 05:28:39','ikemnkur','G0FOMQ7T7A',NULL,NULL,'e4bd0c11e6ce14bdc2ce27f3bcc62ffd','faea112d1a10e292e72cf2e943acc29b',NULL),(2,'2026-02-10 05:29:27','ikemnkur','G0FOMQ7T7A',NULL,NULL,'0ca2e561fc8f09ae36ffd9826d8e33df','8abc4066f29e8acd535bd91a36f9a3a3',NULL),(3,'2026-02-10 05:32:47','ikemnkur','G0FOMQ7T7A',NULL,NULL,'cb22e8241f4a656bd5167f1ee0414ae1','ee442b98a9ccd7f5f30ba353536d63cf',NULL),(4,'2026-02-10 06:41:47','ikemnkur','G0FOMQ7T7A',NULL,NULL,'bug-swatter.png','360_F_76210866_w7VrYRaP1pvUgSLZf7j2TIiGTsOrliiX.png',NULL),(5,'2026-02-10 07:02:17','ikemnkur','G0FOMQ7T7A',NULL,NULL,'bug-swatter.png','360_F_76210866_w7VrYRaP1pvUgSLZf7j2TIiGTsOrliiX.png',NULL),(6,'2026-02-19 04:14:53','ikemnkur','G0FOMQ7T7A',NULL,NULL,'qwik_pay_icon.png','ChatGPT_Image_Feb_7_2026_01_48_59_PM.png',NULL),(7,'2026-02-22 04:22:31','ikemnkur','G0FOMQ7T7A',NULL,NULL,'Trailer.wav','sample-15s.wav',NULL);
/*!40000 ALTER TABLE `leaks_reports` ENABLE KEYS */;
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

-- Dump completed on 2026-03-06 22:05:58
