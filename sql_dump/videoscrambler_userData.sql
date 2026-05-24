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
-- Table structure for table `userData`
--

DROP TABLE IF EXISTS `userData`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `userData` (
  `id` varchar(10) NOT NULL,
  `username` varchar(50) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `credits` int DEFAULT '150',
  `passwordHash` varchar(255) DEFAULT NULL,
  `accountType` enum('free','basic','standard','premium') DEFAULT NULL,
  `lastLogin` datetime DEFAULT NULL,
  `loginStatus` tinyint(1) DEFAULT NULL,
  `firstName` varchar(50) DEFAULT NULL,
  `lastName` varchar(50) DEFAULT NULL,
  `phoneNumber` varchar(20) DEFAULT NULL,
  `birthDate` date DEFAULT NULL,
  `encryptionKey` varchar(100) DEFAULT NULL,
  `reportCount` int DEFAULT NULL,
  `isBanned` tinyint(1) DEFAULT NULL,
  `banReason` text,
  `banDate` datetime DEFAULT NULL,
  `banDuration` int DEFAULT NULL,
  `createdAt` bigint DEFAULT NULL,
  `updatedAt` bigint DEFAULT NULL,
  `twoFactorEnabled` tinyint(1) DEFAULT '0',
  `twoFactorSecret` varchar(50) DEFAULT NULL,
  `recoveryCodes` json DEFAULT NULL,
  `profilePicture` varchar(255) DEFAULT NULL,
  `bio` text,
  `socialLinks` json DEFAULT NULL,
  `dayPassExpiry` timestamp NULL DEFAULT NULL,
  `dayPassMode` varchar(15) DEFAULT NULL,
  `planExpiry` timestamp NULL DEFAULT NULL,
  `verification` varchar(5) DEFAULT 'None',
  `amount1` double DEFAULT NULL,
  `amount2` double DEFAULT NULL,
  `resetCode` varchar(6) DEFAULT NULL,
  `resetCodeExpiry` datetime DEFAULT NULL,
  `cryptoAmounts` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `userData`
--

LOCK TABLES `userData` WRITE;
/*!40000 ALTER TABLE `userData` DISABLE KEYS */;
INSERT INTO `userData` VALUES ('0EYI8RCC2J','scramblurr','scramblurr.app@proton.me',100,'$2b$12$H8yg.uI7V1Azxd4U28oA5.xigcTStFMuTwcx8DH7R5Txzku/IS0YG','free',NULL,1,'Scram','blurr','','2026-02-01','enc_key_1772166317320',0,0,'',NULL,NULL,1772166317179,1772166317179,0,'','[]','https://i.pravatar.cc/150?img=33','','{}',NULL,NULL,NULL,'true',0.1095,0.1579,NULL,NULL,'{\"BTC\":{\"amount1\":\"0.00000161\",\"amount2\":\"0.00000232\"},\"ETH\":{\"amount1\":\"0.00005314\",\"amount2\":\"0.00007663\"},\"LTC\":{\"amount1\":\"0.00194494\",\"amount2\":\"0.00280462\"},\"SOL\":{\"amount1\":\"Infinity\",\"amount2\":\"Infinity\"}}'),('74VF29Z8S0','ikenuru','ikem.nkur@gmail.com',100,'$2b$12$kMnk8QcUipIVqOnU2K8Hbek/AXpuj.Cb6y9Ss1lYmnZznKXNJyQNu','free',NULL,1,'Ikem','Nkurumeh','','1995-02-03','enc_key_1772165217059',0,0,'',NULL,NULL,1772165216859,1772165216859,0,'','[]','https://i.pravatar.cc/150?img=22','','{}',NULL,NULL,NULL,'false',0.103,0.1701,NULL,NULL,'{\"BTC\":{\"amount1\":\"0.00000152\",\"amount2\":\"0.00000251\"},\"ETH\":{\"amount1\":\"0.00005018\",\"amount2\":\"0.00008287\"},\"LTC\":{\"amount1\":\"0.00183732\",\"amount2\":\"0.00303425\"},\"SOL\":{\"amount1\":\"Infinity\",\"amount2\":\"Infinity\"}}'),('G0FOMQ7T7A','ikemnkur','ikemnkur@gmail.com',19112,'$2b$12$Le5VmZbf3X1ZVqhNwCgUhuE5.nD4Wjiyw7vziMJ02oPLVHEmwfzDW','premium','2026-03-07 03:28:50',1,'ikemnkur','','','1997-08-07','enc_key_1762835495752',0,0,'',NULL,NULL,1762835495752,1762835495752,0,'','[]','https://i.pravatar.cc/150?img=51','','{}','2026-01-01 00:56:40','premium','2025-12-31 20:01:23',NULL,0.1198,0.1348,NULL,NULL,NULL),('LCBGL8EJ7L','testman','testman@gmail.com',2661,'$2b$12$/TN5NPt6u0Ui0CFAw1JEk.g/iSsVaj9oO5fKJZEu19gZfbhYDMO8O','standard','2026-03-03 21:21:02',1,'test','man','','2025-12-19','enc_key_1766249887916',0,0,'',NULL,NULL,1766249887915,1766249887915,0,'','[]','https://i.pravatar.cc/150?img=32','','{}','2025-12-27 07:14:12',NULL,NULL,NULL,0.1898,0.1528,NULL,NULL,NULL),('OQJJPJNDDG','user1','user1@gmail.com',66,'$2b$12$PE4/jAwP3Y8m.2zpvEzlT.xMBBGhg3Rih.HVom6uDs3/ohfkPXZLG','free','2026-01-14 20:15:34',1,'user1','man','','2002-01-07','enc_key_1768342266929',0,0,'',NULL,NULL,1768342266928,1768342266928,0,'','[]','https://i.pravatar.cc/150?img=45','Goofy Dawg!!!','{}',NULL,NULL,NULL,NULL,0.1888,0.1628,NULL,NULL,NULL),('RONE0K659W','Exodus','phonixf17@gmail.com',64,'$2b$12$fDSDeKZX0MianZ3cxIUTDODYia39XeIfT9S28iOBtogMRjQ8xWKpe','free',NULL,1,'Leo','Walk','','2007-07-13','enc_key_1772581664498',0,0,'',NULL,NULL,1772581664381,1772581664381,0,'','[]','https://i.pravatar.cc/150?img=60','','{}',NULL,NULL,NULL,'false',0.172,0.1582,NULL,NULL,'{\"BTC\":{\"amount1\":\"0.00000251\",\"amount2\":\"0.00000231\"},\"ETH\":{\"amount1\":\"0.00008655\",\"amount2\":\"0.00007961\"},\"LTC\":{\"amount1\":\"0.00313525\",\"amount2\":\"0.00288370\"},\"SOL\":{\"amount1\":\"Infinity\",\"amount2\":\"Infinity\"}}'),('ZBD1124VF4','ikemuru','ikemuru@gmail.com',5807,'$2b$12$VY3sapBEaH4pOLrOdrvcWOZf8YRHO/gJ4pD7xGnhyOqcc.QEqPdX6','standard','2026-02-25 06:36:48',1,'Ikemuru','Nkurumeh','','2000-12-11','enc_key_1765146800055',0,0,'',NULL,NULL,1765146800055,1765146800055,0,'','[]','https://i.pravatar.cc/150?img=46','','{}','2026-01-11 20:49:42','premium','2026-01-31 20:01:23',NULL,0.158,0.19,NULL,NULL,NULL);
/*!40000 ALTER TABLE `userData` ENABLE KEYS */;
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

-- Dump completed on 2026-03-06 22:06:47
