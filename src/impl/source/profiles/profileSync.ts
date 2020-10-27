import { SFPowerkit, LoggerLevel } from "../../../sfpowerkit";
import MetadataFiles from "../../metadata/metadataFiles";
import * as fs from "fs-extra";
import * as path from "path";
import { METADATA_INFO } from "../../metadata/metadataInfo";
import Profile from "../../../impl/metadata/schema";
import * as _ from "lodash";
import ProfileActions from "./profileActions";
import ProfileWriter from "../../../impl/metadata/writer/profileWriter";
import { ProgressBar } from "../../../ui/progressBar";

const unsupportedprofiles = [];

export default class ProfileSync extends ProfileActions {
  metadataFiles: MetadataFiles;

  public async sync(
    srcFolders: string[],
    profiles?: string[],
    isdelete?: boolean,
    isExcludePackages?: boolean
  ): Promise<{
    added: string[];
    deleted: string[];
    updated: string[];
  }> {
    SFPowerkit.log("Retrieving profiles", LoggerLevel.DEBUG);
    if (!_.isNil(profiles) && profiles.length !== 0) {
      SFPowerkit.log("Requested  profiles are..", LoggerLevel.DEBUG);
      SFPowerkit.log(profiles, LoggerLevel.DEBUG);
    }

    let fetchNewProfiles = _.isNil(srcFolders) || srcFolders.length === 0;
    if (fetchNewProfiles) {
      srcFolders = await SFPowerkit.getProjectDirectories();
    }

    this.metadataFiles = new MetadataFiles();

    SFPowerkit.log("Source Folders are", LoggerLevel.DEBUG);
    SFPowerkit.log(srcFolders, LoggerLevel.DEBUG);

    for (let i = 0; i < srcFolders.length; i++) {
      let srcFolder = srcFolders[i];
      let normalizedPath = path.join(process.cwd(), srcFolder);
      this.metadataFiles.loadComponents(normalizedPath);
    }

    //get local profiles when profile path is provided
    if (!fetchNewProfiles && profiles.length < 1) {
      METADATA_INFO.Profile.files.forEach(element => {
        let oneName = path.basename(
          element,
          METADATA_INFO.Profile.sourceExtension
        );
        profiles.push(oneName);
      });
    }

    //let profileList: string[] = [];
    let profileNames: string[] = [];
    let profilePathAssoc = {};
    let profileStatus = await this.getProfileFullNamesWithLocalStatus(profiles);

    let metadataFiles = [];
    if (fetchNewProfiles) {
      //Retriving local profiles and anything extra found in the org
      metadataFiles = _.union(profileStatus.added, profileStatus.updated);
    } else {
      //Retriving only local profiles
      metadataFiles = profileStatus.updated;
      profileStatus.added = [];
    }
    metadataFiles.sort();
    SFPowerkit.log(profileStatus, LoggerLevel.DEBUG);

    SFPowerkit.log(metadataFiles, LoggerLevel.TRACE);

    if (metadataFiles.length > 0) {
      for (var i = 0; i < metadataFiles.length; i++) {
        var profileComponent = metadataFiles[i];
        var profileName = path.basename(
          profileComponent,
          METADATA_INFO.Profile.sourceExtension
        );

        var supported = !unsupportedprofiles.includes(profileName);
        if (supported) {
          profilePathAssoc[profileName] = profileComponent;
          profileNames.push(profileName);
        }
      }

      var i: number,
        j: number,
        chunk: number = 10;
      var temparray;
      SFPowerkit.log(
        `Number of profiles found in the target org ${profileNames.length}`,
        LoggerLevel.INFO
      );

      let progressBar = new ProgressBar().create(
        `Loading profiles in batches `,
        ` Profiles`,
        LoggerLevel.INFO
      );
      progressBar.start(profileNames.length);
      for (i = 0, j = profileNames.length; i < j; i += chunk) {
        temparray = profileNames.slice(i, i + chunk);

        var metadataList = await this.profileRetriever.loadProfiles(
          temparray,
          this.conn
        );

        let profileWriter = new ProfileWriter();
        for (var count = 0; count < metadataList.length; count++) {
          var profileObj = metadataList[count] as Profile;

          if ( isExcludePackages) {
            profileObj = this.removePackages(profileObj);
          }

          profileWriter.writeProfile(
            profileObj,
            profilePathAssoc[profileObj.fullName]
          );
          //profileList.push(profileObj.fullName);
        }
        progressBar.increment(j - i > chunk ? chunk : j - i);
      }
      progressBar.stop();
    } else {
      SFPowerkit.log(`No Profiles found to retrieve`, LoggerLevel.INFO);
    }

    if (profileStatus.deleted && isdelete) {
      profileStatus.deleted.forEach(file => {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      });
    }
    return Promise.resolve(profileStatus);
  }

  private removePackages(profileObj: Profile): Profile {

    if ( profileObj.applicationVisibilities != undefined
        && profileObj.applicationVisibilities.length > 0) {
      var newApplicationVisibilities = [];
      for ( var k = 0; k < profileObj.applicationVisibilities.length; k++) {
        var appVisibility = profileObj.applicationVisibilities[k] as ApplicationVisibility;
        if ( appVisibility.application.indexOf("__") == -1) {
          newApplicationVisibilities.push(appVisibility);
        }
      }
      profileObj.applicationVisibilities = newApplicationVisibilities;
    }

    if ( profileObj.classAccesses != undefined
        && profileObj.classAccesses.length > 0) {
      var newClassAccesses = [];
      for ( var k = 0; k < profileObj.classAccesses.length; k++) {
        var classAccess = profileObj.classAccesses[k] as ProfileApexClassAccess;
        if ( classAccess.apexClass.indexOf("__") == -1) {
          newClassAccesses.push(classAccess);
        }
      }
      profileObj.classAccesses = newClassAccesses;
    }

    if ( profileObj.fieldPermissions != undefined
        && profileObj.fieldPermissions.length > 0) {
      var newFieldPermissions = [];
      for ( var k = 0; k < profileObj.fieldPermissions.length; k++) {
        var fieldPermission = profileObj.fieldPermissions[k] as ProfileFieldLevelSecurity;
        if ( fieldPermission.field.search(".*\..*__.*__c") == -1) {
          newFieldPermissions.push(fieldPermission);
        }
      }
      profileObj.fieldPermissions = newFieldPermissions;
    }

    if ( profileObj.layoutAssignments != undefined
        && profileObj.layoutAssignments.length > 0) {
      var newLayoutAssignments = [];
      for ( var k = 0; k < profileObj.layoutAssignments.length; k++) {
        var layoutAssignment = profileObj.layoutAssignments[k] as ProfileLayoutAssignments;
        if ( layoutAssignment.layout.search(".*__.*__.*-") == -1) {
          newLayoutAssignments.push(layoutAssignment);
        }
      }
      profileObj.layoutAssignments = newLayoutAssignments;
    }

    if ( profileObj.objectPermissions != undefined
        && profileObj.objectPermissions.length > 0) {
      var newObjectPermissions = [];
      for ( var k = 0; k < profileObj.objectPermissions.length; k++) {
        var objectPermission = profileObj.objectPermissions[k] as ProfileObjectPermissions;
        if ( objectPermission.object.search(".*__.*__.*") == -1) {
          newObjectPermissions.push(objectPermission);
        }
      }
      profileObj.objectPermissions = newObjectPermissions;
    }

    if ( profileObj.pageAccesses != undefined
        && profileObj.pageAccesses.length > 0) {
      var newPageAccess = [];
      for ( var k = 0; k < profileObj.pageAccesses.length; k++) {
        var apexPageAccess = profileObj.pageAccesses[k] as ProfileApexPageAccess;
        if ( apexPageAccess.apexPage.search(".*__.*") == -1) {
          newPageAccess.push(apexPageAccess);
        }
      }
      profileObj.pageAccesses = newPageAccess;
    }

    if ( profileObj.recordTypeVisibilities != undefined
        && profileObj.recordTypeVisibilities.length > 0) {
      var newRecordTypeVisibility = [];
      for ( var k = 0; k < profileObj.recordTypeVisibilities.length; k++) {
        var recordTypeVisibility = profileObj.recordTypeVisibilities[k] as RecordTypeVisibility;
        if ( recordTypeVisibility.recordType.search(".*__.*__.*\.") == -1) {
          newRecordTypeVisibility.push(recordTypeVisibility);
        }
      }
      profileObj.recordTypeVisibilities = newRecordTypeVisibility;
    }

    if ( profileObj.tabVisibilities != undefined
        && profileObj.tabVisibilities.length > 0) {
      var newTabVisibility = [];
      for ( var k = 0; k < profileObj.tabVisibilities.length; k++) {
        var tabVisibility = profileObj.tabVisibilities[k] as RecordTypeVisibility;
        if ( tabVisibility.tab.search(".*__.*|standard-.*") == -1) {
          newTabVisibility.push(tabVisibility);
        }
      }
      profileObj.tabVisibilities = newTabVisibility;
    }
    return profileObj;
  }
}
