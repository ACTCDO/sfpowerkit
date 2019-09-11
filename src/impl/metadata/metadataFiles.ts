import * as path from "path";
import {
  MetadataInfo,
  METADATA_INFO,
  MetadataDescribe,
  SOURCE_EXTENSION_REGEX
} from "./metadataInfo";
import FileUtils from "../../utils/fileutils";
import _ from "lodash";
import ignore from "ignore";
import * as fs from "fs";
import * as glob from "glob";

export default class MetadataFiles {
  public static sourceOnly: boolean = false;
  forceignore: any;
  public constructor() {
    if (fs.existsSync(".forceignore")) {
      this.forceignore = ignore().add(
        fs.readFileSync(".forceignore", "utf8").toString()
      );
    } else {
      this.forceignore = ignore();
    }
  }
  static getFullApiName(fileName: string): string {
    let fullName = "";
    let metadateType = MetadataInfo.getMetadataName(fileName);
    let splitFilepath = fileName.split(path.sep);
    let isObjectChild = METADATA_INFO.CustomObject.childXmlNames.includes(
      metadateType
    );
    if (isObjectChild) {
      let objectName = splitFilepath[splitFilepath.length - 3];
      let fieldName = splitFilepath[splitFilepath.length - 1].split(".")[0];
      fullName = objectName.concat("." + fieldName);
    } else {
      fullName = splitFilepath[splitFilepath.length - 1].split(".")[0];
    }
    return fullName;
  }
  static getFullApiNameWithExtension(fileName: string): string {
    let fullName = "";
    let metadateType = MetadataInfo.getMetadataName(fileName);
    let splitFilepath = fileName.split(path.sep);
    let isObjectChild = METADATA_INFO.CustomObject.childXmlNames.includes(
      metadateType
    );
    if (isObjectChild) {
      let objectName = splitFilepath[splitFilepath.length - 3];
      let fieldName = splitFilepath[splitFilepath.length - 1];
      fullName = objectName.concat("." + fieldName);
    } else {
      fullName = splitFilepath[splitFilepath.length - 1];
    }
    return fullName;
  }

  public static isCustomMetadata(filepath: string, name: string): boolean {
    let result = true;
    let splitFilepath = filepath.split(path.sep);
    let componentName = splitFilepath[splitFilepath.length - 1];
    componentName = componentName.substring(0, componentName.indexOf("."));
    if (
      name === METADATA_INFO.CustomField.xmlName ||
      name === METADATA_INFO.CustomObject.xmlName
    ) {
      //Custom Field or Custom Object
      result = componentName.endsWith("__c") || componentName.endsWith("__mdt");
    }
    return result;
  }
  public static getMemberNameFromFilepath(
    filepath: string,
    name: string
  ): string {
    let member: string;
    let splitFilepath = filepath.split(path.sep);
    let lastIndex = splitFilepath.length - 1;
    let isObjectChild = METADATA_INFO.CustomObject.childXmlNames.includes(name);
    let metadataDescribe: MetadataDescribe = METADATA_INFO[name];
    if (isObjectChild) {
      let objectName = splitFilepath[lastIndex - 2];
      let fieldName = splitFilepath[lastIndex].split(".")[0];
      member = objectName.concat("." + fieldName);
    } else if (metadataDescribe.inFolder) {
      let baseName = metadataDescribe.directoryName;
      let baseIndex = filepath.indexOf(baseName) + baseName.length;
      let cmpPath = filepath.substring(baseIndex + 1); // add 1 to remove the path seperator
      cmpPath = cmpPath.substring(0, cmpPath.indexOf("."));
      member = cmpPath.replace(path.sep, "/");
    } else {
      member = splitFilepath[lastIndex].replace(SOURCE_EXTENSION_REGEX, "");
    }
    return member;
  }

  public loadComponents(srcFolder: string): void {
    var metadataFiles: string[] = FileUtils.getAllFilesSync(srcFolder);
    let keys = Object.keys(METADATA_INFO);
    if (Array.isArray(metadataFiles) && metadataFiles.length > 0) {
      metadataFiles.forEach(metadataFile => {
        for (let i = 0; i < keys.length; i++) {
          let match = false;
          if (metadataFile.endsWith(METADATA_INFO[keys[i]].sourceExtension)) {
            match = true;
          } else if (
            METADATA_INFO[keys[i]].inFolder &&
            metadataFile.endsWith(METADATA_INFO[keys[i]].folderExtension)
          ) {
            match = true;
          }
          if (match) {
            if (_.isNil(METADATA_INFO[keys[i]].files)) {
              METADATA_INFO[keys[i]].files = [];
              METADATA_INFO[keys[i]].components = [];
            }
            let isValid = this.accepts(metadataFile);
            if (isValid) {
              METADATA_INFO[keys[i]].files.push(metadataFile);

              let name = FileUtils.getFileNameWithoutExtension(
                metadataFile,
                METADATA_INFO[keys[i]].sourceExtension
              );

              if (METADATA_INFO[keys[i]].isChildComponent) {
                let fileParts = metadataFile.split(path.sep);
                let parentName = fileParts[fileParts.length - 3];
                name = parentName + "." + name;
              }

              METADATA_INFO[keys[i]].components.push(name);
            }

            break;
          }
        }
      });
    } else {
      keys.forEach(key => {
        if (_.isNil(METADATA_INFO[key].files)) {
          METADATA_INFO[key].files = [];
          METADATA_INFO[key].components = [];
        }
      });
    }
  }
  //Check if a component is accepted by forceignore.
  private accepts(filePath: string) {
    return !this.forceignore.ignores(path.relative(process.cwd(), filePath));
  }

  /**
   * Copy a file to an outpu directory. If the filePath is a Metadata file Path,
   * All the metadata requirement are also copied. For example MyApexClass.cls-meta.xml will also copy MyApexClass.cls.
   * Enforcing the .forceignore to ignire file ignored in the project.
   * @param filePath
   * @param outputFolder
   */
  public static copyFile(filePath: string, outputFolder: string) {
    const LWC_IGNORE_FILES = ["jsconfig.json", ".eslintrc.json"];
    const pairStatResources = METADATA_INFO.StaticResource.directoryName;
    const pairStatResourcesRegExp = new RegExp(pairStatResources);
    const pairAuaraRegExp = new RegExp(
      METADATA_INFO.AuraDefinitionBundle.directoryName
    );

    let copyOutputFolder = outputFolder;

    let exists = fs.existsSync(path.join(outputFolder, filePath));
    if (exists) {
      return;
    }

    if (filePath.startsWith(".")) {
      fs.copyFileSync(filePath, path.join(outputFolder, filePath));
      return;
    }

    let fileName = path.parse(filePath).base;
    //exclude lwc ignored files
    if (LWC_IGNORE_FILES.includes(fileName)) {
      return;
    }

    let filePathParts = filePath.split(path.sep);

    if (fs.existsSync(outputFolder) == false) {
      fs.mkdirSync(outputFolder);
    }
    // Create folder structure
    for (let i = 0; i < filePathParts.length - 1; i++) {
      let folder = filePathParts[i].replace('"', "");
      outputFolder = path.join(outputFolder, folder);
      if (fs.existsSync(outputFolder) == false) {
        fs.mkdirSync(outputFolder);
      }
    }

    // Copy all file with same base name
    let associatedFilePattern = "";
    if (SOURCE_EXTENSION_REGEX.test(filePath)) {
      associatedFilePattern = filePath.replace(SOURCE_EXTENSION_REGEX, ".*");
    } else {
      let extension = path.parse(filePath).ext;
      associatedFilePattern = filePath.replace(extension, ".*");
    }
    let files = glob.sync(associatedFilePattern);
    for (let i = 0; i < files.length; i++) {
      if (fs.lstatSync(files[i]).isDirectory() == false) {
        let oneFilePath = path.join(".", files[i]);
        let oneFilePathParts = oneFilePath.split(path.sep);
        fileName = oneFilePathParts[oneFilePathParts.length - 1];
        let outputPath = path.join(outputFolder, fileName);
        fs.copyFileSync(files[i], outputPath);
      }
    }

    // Hadle ObjectTranslations
    // If a file fieldTranslation is copied, make sure the ObjectTranslation File is also copied
    if (
      filePath.endsWith("Translation-meta.xml") &&
      filePath.indexOf("globalValueSet") < 0
    ) {
      let parentFolder = filePathParts[filePathParts.length - 2];
      let objectTranslation =
        parentFolder + METADATA_INFO.CustomObjectTranslation.sourceExtension;
      let outputPath = path.join(outputFolder, objectTranslation);
      let sourceFile = filePath.replace(fileName, objectTranslation);
      if (fs.existsSync(sourceFile) == true) {
        fs.copyFileSync(sourceFile, outputPath);
      }
    }

    //FOR STATIC RESOURCES - WHERE THE CORRESPONDING DIRECTORY + THE ROOT META FILE HAS TO BE INCLUDED
    if (pairStatResourcesRegExp.test(filePath)) {
      outputFolder = path.join(".", copyOutputFolder);
      let srcFolder = ".";
      let staticRecourceRoot = "";
      let resourceFile = "";
      for (let i = 0; i < filePathParts.length; i++) {
        outputFolder = path.join(outputFolder, filePathParts[i]);
        srcFolder = path.join(srcFolder, filePathParts[i]);
        if (filePathParts[i] === METADATA_INFO.StaticResource.directoryName) {
          let fileOrDirname = filePathParts[i + 1];
          let fileOrDirnameParts = fileOrDirname.split(".");
          srcFolder = path.join(srcFolder, fileOrDirnameParts[0]);
          outputFolder = path.join(outputFolder, fileOrDirnameParts[0]);
          resourceFile =
            srcFolder + METADATA_INFO.StaticResource.sourceExtension;
          METADATA_INFO.StaticResource.sourceExtension;
          staticRecourceRoot =
            outputFolder + METADATA_INFO.StaticResource.sourceExtension;
          if (fs.existsSync(srcFolder)) {
            if (fs.existsSync(outputFolder) == false) {
              fs.mkdirSync(outputFolder);
            }
          }
          break;
        }
      }
      if (fs.existsSync(srcFolder)) {
        FileUtils.copyRecursiveSync(srcFolder, outputFolder);
      }
      if (fs.existsSync(resourceFile)) {
        fs.copyFileSync(resourceFile, staticRecourceRoot);
      }
    }
    //FOR AURA components and LWC components
    if (pairAuaraRegExp.test(filePath)) {
      outputFolder = path.join(".", copyOutputFolder);
      let srcFolder = ".";
      for (let i = 0; i < filePathParts.length; i++) {
        outputFolder = path.join(outputFolder, filePathParts[i]);
        srcFolder = path.join(srcFolder, filePathParts[i]);
        if (filePathParts[i] === "aura" || filePathParts[i] === "lwc") {
          let fileOrDirname = filePathParts[i + 1];
          let fileOrDirnameParts = fileOrDirname.split(".");
          srcFolder = path.join(srcFolder, fileOrDirnameParts[0]);
          outputFolder = path.join(outputFolder, fileOrDirnameParts[0]);

          if (fs.existsSync(srcFolder)) {
            if (fs.existsSync(outputFolder) == false) {
              fs.mkdirSync(outputFolder);
            }
          }
          break;
        }
      }
      if (fs.existsSync(srcFolder)) {
        FileUtils.copyRecursiveSync(srcFolder, outputFolder);
      }
    }
  }
}
