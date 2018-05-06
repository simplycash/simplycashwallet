import { NgModule } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { IonicPageModule } from 'ionic-angular';

import { ComponentsModule } from '../../components/components.module'
import { PipesModule } from '../../pipes/pipes.module'

import { HomePage } from './home';

@NgModule({
  declarations: [
    HomePage,
  ],
  imports: [
    IonicPageModule.forChild(HomePage),
    TranslateModule.forChild(),
    ComponentsModule,
    PipesModule
  ],
  exports: [
    HomePage
  ]
})
export class HomePageModule { }
